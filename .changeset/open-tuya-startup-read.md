---
"open-tuya": patch
---

`createTuyaClient` reads the device to find its catalog entry over a LAN route listed first, waiting for it to connect, rather than skipping it for the cloud, and closes the routes it built when a later route throws while being built.
