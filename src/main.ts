import * as core from '@actions/core'
import {ActionParameters, parseParameters} from './parameters'
import * as fs from 'fs-extra'
import path from 'path'
import fetch from 'node-fetch'
import {GitHub} from '@actions/github/lib/utils'
import {exec} from '@actions/exec'
import {pipeAndWaitThenClose} from './util'
import {EOL} from 'os'

async function copyDataDir(
  output: string,
  [dir, dirMessage]: [string | null, string],
  [file, fileMessage]: [string | null, string],
): Promise<void> {
  if (dir && dir !== '') {
    core.info(`copying ${dirMessage}`)
    await fs.copy(dir, output)
  }
  if (file && file !== '') {
    core.info(`copying ${fileMessage}`)
    const basename = path.basename(file)
    await fs.ensureDir(output)
    await fs.copy(file, path.join(output, basename))
  }
}

async function prepareMinecraftServerAutoCloser(
  workDir: string,
  minecraftServerAutoCloserPath: string,
  configData: string,
  minecraftVersion: string,
): Promise<void> {
  await fs.ensureDir(path.join(workDir, 'mods'))
  const jarPath = path.join(
    workDir,
    'mods',
    '.com.anatawa12.minecraft-server-start-test.minecraft-server-auto-closer.jar',
  )
  if (minecraftServerAutoCloserPath === '') {
    const octokit = new GitHub()
    const release = await octokit.rest.repos.getLatestRelease({
      owner: 'anatawa12',
      repo: 'minecraft-server-auto-closer',
    })
    let pattern: RegExp
    if (Number(minecraftVersion.split('.')[1]) <= 12) {
      pattern = /^minecraft-server-auto-closer-[0-9.]+\.jar$/
    } else {
      pattern = /^minecraft-server-auto-closer-post1\.13-[0-9.]+\.jar$/
    }
    const asset = release.data.assets.find(x => pattern.test(x.name))
    if (!asset)
      throw new Error(
        `no asset of minecraft-server-auto-closer of ${release.data.name}`,
      )

    const res = await fetch(asset.browser_download_url)
    if (!res.ok)
      throw new Error(
        `downloading minecraft-server-auto-closer: invalid response: ${res.status} ${res.statusText} ` +
          `downloading ${asset.browser_download_url}`,
      )

    await pipeAndWaitThenClose(res.body, fs.createWriteStream(jarPath))
  } else {
    const sourceFile = fs.createReadStream(minecraftServerAutoCloserPath)
    await pipeAndWaitThenClose(sourceFile, fs.createWriteStream(jarPath))
    sourceFile.close()
  }

  await fs.ensureDir(path.join(workDir, 'config'))
  await fs.writeFile(
    path.join(workDir, 'config', 'minecraft-server-auto-closer.txt'),
    configData,
  )
}

async function signEula(workDir: string): Promise<void> {
  await fs.writeFile(path.join(workDir, 'eula.txt'), `eula=true${EOL}`)
}

/**
 * @returns The path or name of jar file to start sever
 */
async function prepareEnvironment(params: ActionParameters): Promise<string> {
  core.info('downloading and preparing server directory...')
  await params.serverProvider.build(params.workDir)
  const versionInfo = await params.serverProvider.getRuntimeInfo(params.workDir)

  await copyDataDir(
    path.join(params.workDir, 'mods'),
    [params.modsDir, 'mods directory'],
    [params.modJar, 'mod jar'],
  )

  await copyDataDir(
    path.join(params.workDir, 'config'),
    [params.configDir, 'config directory'],
    [params.configFile, 'config file'],
  )

  if (params.worldData !== '') {
    core.info('copying world data directory')
    await fs.copy(params.worldData, path.join(params.workDir, 'world'))
  } else {
    core.warning(
      "no world data specified! It's recommended to " +
        'prepare a simple vanilla world data to prevent world generation!',
    )
  }

  await prepareMinecraftServerAutoCloser(
    params.workDir,
    params.minecraftServerAutoCloserPath,
    params.sleepTimeConfig,
    versionInfo.minecraftVersion,
  )

  await signEula(params.workDir)

  return versionInfo.jarPath
}

async function timeoutError(
  timeout: number | null,
  message: string,
): Promise<never> {
  if (!timeout) {
    await new Promise<never>(() => {
      // never resolved.
    })
  } else {
    await new Promise<never>((resolve, reject) => {
      setTimeout(() => {
        reject(new Error(message))
      }, timeout)
    })
  }
  throw new Error(`logic failure: after awaiting never function`)
}

async function startServer(workDir: string, serverName: string): Promise<void> {
  await exec('java', ['-jar', serverName], {
    cwd: workDir,
  })

  let crashed: boolean
  try {
    crashed =
      (await fs.readdir(path.join(workDir, 'crash-reports'))).length !== 0
  } catch (e) {
    if (e && e.code && e.code === 'ENOENT') {
      // notfound: no crash
      crashed = false
    } else {
      // unknown error, rethrow
      throw e
    }
  }

  // check crash-reports to detect crash
  if (crashed) {
    throw new Error('crash report found! it looks starting server failed!')
  }
}

async function run(): Promise<void> {
  try {
    const params = await parseParameters()

    core.setOutput('work_dir', params.workDir)

    // prepare the environment
    const serverName = await prepareEnvironment(params)

    // now, it's time to start server!
    await Promise.race([
      timeoutError(
        params.timeout,
        `Starting server took ` +
          `${params.timeout} milliseconds. it's too long`,
      ),
      startServer(params.workDir, serverName),
    ])
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
