# minecraft-server-start-test
[![ci status](https://github.com/anatawa12/minecraft-server-start-test/workflows/build-test/badge.svg)](https://github.com/anatawa12/minecraft-server-start-test/actions)
[![a12 maintenance: Slowly](https://anatawa12.com/short.php?q=a12-slowly-svg)](https://anatawa12.com/short.php?q=a12-slowly-doc)
[![latest release](https://img.shields.io/github/v/release/anatawa12/minecraft-server-start-test)](https://github.com/anatawa12/minecraft-server-start-test/releases/latest)

An action to check a mod can be launched with server. currently supports server.

## Parameters(planned)

| name         | is optional | Default  | description
| ---          | ----------- | -------- | ----
| server_type  | optional    | forge    | The minecraft server type. by default, and currently supports only forge
| work_dir     | optional    | (none)   | The path to server working directory. If not specified, this will create temp directory.
| version      | required    |          | The version of minecraft server. For forge, the version number in installer jar like `1.12.2-14.23.5.2855` or `1.7.10-10.13.4.1614-1.7.10` are valid.
| sleep_time   | optional    | 0s       | The time before sending 'stop' command after FMLServerStartedEvent. You can specify in seconds or ticks.
| timeout      | optional    | (none)   | Timeout until server started. if timeout reached, this action will falls
| world_data   | optional    | (none)   | The path to minecraft world data.
| mods         | optional    | (none)   | The path to your mods folder.
| mod_jar      | optional    | (none)   | The path to your mod jar. This will be added to mods directory.

## Limitations(planned)
- You can't name your mod(s) starting with `.com.anatawa12.minecraft-server-start-test`.
  it will be an error.
