---
"@open-tuya/local": minor
---

Follow a device to a new address: pass `discovery` to `createLocalTuyaClient`, and after a lost connection or a failed connect the client tries the address the discovery last heard the device at, returning to the last address that worked if that fails too. `TuyaDiscovery.devices` holds the latest report from each device, and `onDevice` is optional. `LocalTuyaClient`'s constructor now takes the host, and passes the address to connect to as the first argument of its connect function.
