import * as core from '@actions/core'
import * as fs from 'fs-extra'
import {dir as tempDir, file as tempFile} from 'tmp-promise'
import {exec} from '@actions/exec'
import fetch from 'node-fetch'
import {default as parseDuration} from 'parse-duration'
import {pipeAndWaitThenClose} from './util'
import {resolve as resolvePath} from 'path'

export interface LaunchConfig {
  command: string
  args?: string[]
}

export interface RuntimeVersionInfo {
  launch: LaunchConfig
  minecraftVersion: string
}

export interface ServiceProvider {
  cacheKey: string
  build(dir: string): Promise<void>
  getRuntimeInfo(dir: string): Promise<RuntimeVersionInfo>
}

export interface ActionParameters {
  serverProvider: ServiceProvider
  // the format can be used in config file.
  sleepTimeConfig: string
  workDir: string
  // in milliseconds
  timeout: number | null
  worldData: string
  modJar: string
  modsDir: string
  configFile: string
  configDir: string

  // undocumented
  minecraftServerAutoCloserPath: string
  githubToken: string
}

export function parseProvider(
  server_type: string,
  version: string,
): ServiceProvider {
  switch (server_type.toLowerCase()) {
    case 'forge': {
      async function build(work: string): Promise<void> {
        const jarName = `forge-${version}-installer.jar`
        // download installer
        const res = await fetch(
          `https://maven.minecraftforge.net/net/minecraftforge/forge` +
            `/${version}/${jarName}`,
        )
        if (!res.ok)
          throw new Error(
            `downloading forge installer for ${version} failed: ` +
              `invalid response code: ${res.status} ${res.statusText}`,
          )
        const installerJarPath = (await tempFile({postfix: jarName})).path
        await pipeAndWaitThenClose(
          res.body,
          fs.createWriteStream(installerJarPath),
        )

        // install jar
        core.startGroup('minecraft server installation')
        await exec('java', ['-jar', installerJarPath, '--installServer'], {
          cwd: work,
        })
        core.endGroup()
        await fs.unlink(installerJarPath)
      }
      const minecraftVersion = version.substr(0, version.indexOf('-'))
      let getRuntimeInfo
      getRuntimeInfo = async (work: string): Promise<RuntimeVersionInfo> => {
        const forgeRuns = (await fs.readdir(work)).filter(
          x => x.startsWith('forge') && x.endsWith('.jar'),
        )
        if (forgeRuns.length === 0) {
          throw new Error('no server forge jar found! please report me!')
        } else if (forgeRuns.length !== 1) {
          throw new Error('multiple server forge jar found! please report me!')
        }

        return {
          launch: {
            command: 'java',
            args: ['-jar', forgeRuns[0]],
          },
          minecraftVersion,
        }
      }
      if (Number(minecraftVersion.split('.')[1]) >= 17) {
        getRuntimeInfo = async () => {
          if (process.platform === 'win32') {
            return {
              launch: {command: 'cmd', args: ['/C', 'run.bat']},
              minecraftVersion,
            }
          } else {
            return {
              launch: {command: './run.sh'},
              minecraftVersion,
            }
          }
        }
      }

      return {
        cacheKey: `forge-${version}`,
        build,
        getRuntimeInfo,
      }
    }
    default:
      throw new Error(`unsupported server_type: ${server_type}`)
  }
}

function parseSleepTime(sleep_time: string): string {
  const matchForBefore = sleep_time.match(/^before\s+(\w+)/)
  if (matchForBefore) {
    return `before ${matchForBefore[1]}`
  }
  const timeRegex = /^(\d+)(s|t|second|seconds|tick|ticks)$/
  const match = sleep_time.match(timeRegex)
  if (!match) throw new Error(`invalid sleep_time: ${sleep_time}`)
  const number = match[1]
  let unit: string
  switch (match[2]) {
    case 's':
    case 'second':
    case 'seconds':
      unit = 'seconds'
      break
    case 't':
    case 'tick':
    case 'ticks':
      unit = 'ticks'
      break
    default:
      throw new Error('logic failure, please report us!')
  }
  return `${number} ${unit}`
}

async function parseWorkDir(work_dir: string): Promise<string> {
  if (work_dir === '') return (await tempDir()).path
  else return resolvePath(work_dir)
}

export async function parseParameters(): Promise<ActionParameters> {
  const server_type = core.getInput('server_type')
  const version = core.getInput('version')
  const work_dir = core.getInput('work_dir')
  const stop_at = core.getInput('sleep_time') || core.getInput('stop_at')
  const timeout = core.getInput('timeout')
  const world_data = core.getInput('world_data')
  const mods_dir = core.getInput('mods_dir')
  const mod_jar = core.getInput('mod_jar')
  const config_dir = core.getInput('config_dir')
  const config_file = core.getInput('config_file')
  const minecraft_server_auto_closer_path = core.getInput(
    'minecraft_server_auto_closer_path',
  )
  const github_token = core.getInput('github_token')

  return {
    serverProvider: parseProvider(server_type, version),
    workDir: await parseWorkDir(work_dir),
    sleepTimeConfig: parseSleepTime(stop_at),
    timeout:
      timeout === ''
        ? null
        : parseDuration(timeout) ?? throwError(`invalid timeout: ${timeout}`),
    worldData: world_data,
    modJar: mod_jar,
    modsDir: mods_dir,
    configFile: config_file,
    configDir: config_dir,
    minecraftServerAutoCloserPath: minecraft_server_auto_closer_path,
    githubToken: github_token,
  }
}

function throwError(msg: string): never {
  throw new Error(msg)
}
