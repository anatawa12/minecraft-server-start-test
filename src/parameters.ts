import * as core from '@actions/core'
import fetch from 'node-fetch'
import {file as tempFile, dir as tempDir} from 'tmp-promise'
import * as fs from 'fs-extra'
import {default as parseDuration} from 'parse-duration'
import exec from '@actions/exec'

export interface ActionParameters {
  /**
   * @param dir the directory for server
   * @returns the path or name of jar file to start the server
   */
  serverProvider(dir: string): Promise<string>
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
}

export function parseProvider(
  server_type: string,
  version: string,
): (work: string) => Promise<string> {
  switch (server_type.toLowerCase()) {
    case 'forge':
      return async work => {
        // download installer
        const res = await fetch(
          `https://maven.minecraftforge.net/net/minecraftforge/forge` +
            `/${version}/forge-${version}-installer.jar`,
        )
        if (!res.ok)
          throw new Error(
            `downloading forge installer for ${version} failed: ` +
              `invalid response code: ${res.status} ${res.statusText}`,
          )
        const installerJarPath = (await tempFile({postfix: '.jar'})).path
        const installerJarWriter = fs.createWriteStream(installerJarPath)
        res.body.pipe(installerJarWriter)
        installerJarWriter.close()

        // install jar
        await exec.exec('java', ['-jar', installerJarPath, '--installServer'], {
          cwd: work,
        })
        await fs.rm(installerJarPath)
        return `forge-${version}-installer.jar`
      }
    default:
      throw new Error(`unsupported server_type: ${server_type}`)
  }
}

function parseSleepTime(sleep_time: string): string {
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
  else return work_dir
}

export async function parseParameters(): Promise<ActionParameters> {
  const server_type = core.getInput('server_type')
  const version = core.getInput('version')
  const work_dir = core.getInput('work_dir')
  const sleep_time = core.getInput('sleep_time')
  const timeout = core.getInput('timeout')
  const world_data = core.getInput('world_data')
  const mods_dir = core.getInput('mods_dir')
  const mod_jar = core.getInput('mod_jar')
  const config_dir = core.getInput('config_dir')
  const config_file = core.getInput('config_file')

  return {
    serverProvider: parseProvider(server_type, version),
    workDir: await parseWorkDir(work_dir),
    sleepTimeConfig: parseSleepTime(sleep_time),
    timeout:
      timeout === ''
        ? null
        : parseDuration(timeout) ?? throwError(`invalid timeout: ${timeout}`),
    worldData: world_data,
    modJar: mod_jar,
    modsDir: mods_dir,
    configFile: config_file,
    configDir: config_dir,
  }
}

function throwError(msg: string): never {
  throw new Error(msg)
}
