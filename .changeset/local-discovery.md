---
"@open-tuya/local": patch
---

Add `discoverDevices`, which reports each device on the LAN with its address, device ID, protocol version and product key, ready to pass to `createLocalTuyaClient`, and asks 3.5 devices that stay silent to answer.
