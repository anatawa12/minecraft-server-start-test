import * as process from 'process'
import {parseParameters} from '../src/parameters'

interface AllParameters {
  server_type: string
  version: string
  work_dir: string
  sleep_time: string
  timeout: string
  world_data: string
  mods_dir: string
  mod_jar: string
  config_dir: string
  config_jar: string
}

async function wrapped(params: Partial<AllParameters>) {
  const env_names: {[P in keyof AllParameters]: string} = {
    server_type: 'INPUT_SERVER_TYPE',
    version: 'INPUT_VERSION',
    work_dir: 'INPUT_WORK_DIR',
    sleep_time: 'INPUT_SLEEP_TIME',
    timeout: 'INPUT_TIMEOUT',
    world_data: 'INPUT_WORLD_DATA',
    mods_dir: 'INPUT_MODS_DIR',
    mod_jar: 'INPUT_MOD_JAR',
    config_dir: 'INPUT_CONFIG_DIR',
    config_jar: 'INPUT_CONFIG_JAR',
  }

  const defaults: Partial<AllParameters> = {
    server_type: 'forge',
    sleep_time: '0s',
  }

  function set_env(
    parameters: Partial<Omit<AllParameters, 'version'>> &
      Pick<AllParameters, 'version'>,
  ) {
    parameters = Object.assign({}, defaults, parameters)
    for (let [key, value] of Object.entries(env_names)) {
      if (parameters[key as keyof AllParameters]) {
        process.env[value] = parameters[key as keyof AllParameters]
      } else {
        delete process.env[value]
      }
    }
  }

  try {
    set_env(Object.assign({}, params, {version: '1.12.2-14.23.5.2855'}))
    return await parseParameters()
  } finally {
    for (let value of Object.values(env_names)) {
      delete process.env[value]
    }
  }
}

test('parse parameters', async () => {
  await expect(wrapped({})).resolves.toMatchObject({
    sleepTimeConfig: '0 seconds',
    timeout: null,
    worldData: '',
    modJar: '',
    modsDir: '',
    configFile: '',
    configDir: '',
  })
})

describe('sleep_time', () => {
  test('s', async () => {
    await expect(wrapped({sleep_time: '3s'})).resolves.toHaveProperty(
      'sleepTimeConfig',
      '3 seconds',
    )
  })
  test('second', async () => {
    await expect(wrapped({sleep_time: '3second'})).resolves.toHaveProperty(
      'sleepTimeConfig',
      '3 seconds',
    )
  })
  test('seconds', async () => {
    await expect(wrapped({sleep_time: '3seconds'})).resolves.toHaveProperty(
      'sleepTimeConfig',
      '3 seconds',
    )
  })
  test('t', async () => {
    await expect(wrapped({sleep_time: '3t'})).resolves.toHaveProperty(
      'sleepTimeConfig',
      '3 ticks',
    )
  })
  test('tick', async () => {
    await expect(wrapped({sleep_time: '3tick'})).resolves.toHaveProperty(
      'sleepTimeConfig',
      '3 ticks',
    )
  })
  test('ticks', async () => {
    await expect(wrapped({sleep_time: '3ticks'})).resolves.toHaveProperty(
      'sleepTimeConfig',
      '3 ticks',
    )
  })
})
