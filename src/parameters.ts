import * as core from '@actions/core'
import fetch from 'node-fetch'
import {file as tempFile} from 'tmp-promise'
import * as fs from 'fs'
import {default as parseDuration} from 'parse-duration'
import exec from '@actions/exec'

interface ActionParameters {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  serverProvider(dir: string): Promise<void>
  // the format can be used in config file.
  sleepTimeConfig: string
  // in milliseconds
  timeout: number
  worldData: string
  modJar: string
  mods: string
}

function parseProvider(
  server_type: string,
  version: string
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
): (work: string) => Promise<void> {
  switch (server_type.toLowerCase()) {
    case 'forge':
      return async work => {
        // download installer
        const res = await fetch(
          `https://maven.minecraftforge.net/net/minecraftforge/forge` +
            `/${version}/forge-${version}-installer.jar`
        )
        if (!res.ok)
          throw new Error(
            `downloading forge installer for ${version} failed: ` +
              `invalid response code: ${res.status} ${res.statusText}`
          )
        const installerJarPath = (await tempFile({postfix: '.jar'})).path
        const installerJarWriter = fs.createWriteStream(installerJarPath)
        res.body.pipe(installerJarWriter)
        installerJarWriter.close()

        // install jar
        await exec.exec('java', ['-jar', installerJarPath, '--installServer'], {
          cwd: work
        })
        await fs.promises.rm(installerJarPath)
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

export function parseParameters(): ActionParameters {
  const server_type = core.getInput('server_type')
  const version = core.getInput('version')
  const sleep_time = core.getInput('sleep_time')
  const timeout = core.getInput('timeout')
  const world_data = core.getInput('world_data')
  const mods = core.getInput('mods')
  const mod_jar = core.getInput('mod_jar')

  return {
    serverProvider: parseProvider(server_type, version),
    sleepTimeConfig: parseSleepTime(sleep_time),
    timeout:
      parseDuration(timeout) ?? throwError(`invalid timeout: ${timeout}`),
    worldData: world_data,
    modJar: mod_jar,
    mods
  }
}

function throwError(msg: string): never {
  throw new Error(msg)
}
