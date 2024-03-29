import * as core from '@actions/core'
import * as fs from 'fs-extra'
import {ActionParameters, LaunchConfig, parseParameters} from './parameters'
import {EOL} from 'os'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import {exec} from '@actions/exec'
import fetch from 'node-fetch'
import path from 'path'
import {pipeAndWaitThenClose} from './util'

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
  githubToken: string,
): Promise<void> {
  await fs.ensureDir(path.join(workDir, 'mods'))
  const jarPath = path.join(
    workDir,
    'mods',
    '.com.anatawa12.minecraft-server-start-test.minecraft-server-auto-closer.jar',
  )
  if (minecraftServerAutoCloserPath === '') {
    const octokit = githubToken ? github.getOctokit(githubToken) : new GitHub()
    const release = await octokit.rest.repos.getLatestRelease({
      owner: 'anatawa12',
      repo: 'minecraft-server-auto-closer',
    })
    core.info(`using minecraft server auto closer: ${release.data.name}`)
    const pattern = /^minecraft-server-auto-closer-[0-9.]+\.jar$/
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

async function fixRunBat(workDir: string): Promise<void> {
  try {
    const batPath = path.join(workDir, 'run.bat')
    const bat = await fs.readFile(batPath, 'utf-8')
    const fixed = bat
      .split(/\r\n|\r|\n/g)
      .filter(x => x.split(' ')[0] !== 'pause')
      .join('\n')
    core.info(`fixed bat file: "${fixed}"`)
    await fs.writeFile(batPath, fixed)
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (e && (e as any).code && (e as any).code === 'ENOENT') {
      return
    }
    // rethrow
    throw e
  }
}

async function signEula(workDir: string): Promise<void> {
  await fs.writeFile(path.join(workDir, 'eula.txt'), `eula=true${EOL}`)
}

/**
 * @returns The path or name of jar file to start sever
 */
async function prepareEnvironment(
  params: ActionParameters,
): Promise<LaunchConfig> {
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
  } else if (params.sleepTimeConfig === 'before world') {
    // if before world, no 'no world data specified!' warning
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
    params.githubToken,
  )

  await fixRunBat(params.workDir)

  await signEula(params.workDir)

  return versionInfo.launch
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

async function startServer(
  workDir: string,
  launch: LaunchConfig,
): Promise<void> {
  await exec(launch.command, launch.args ?? [], {
    cwd: workDir,
  })

  let crashed: boolean
  try {
    crashed =
      (await fs.readdir(path.join(workDir, 'crash-reports'))).length !== 0
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (e && (e as any).code && (e as any).code === 'ENOENT') {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    core.setFailed((error as any).message)
  }
}

run()
