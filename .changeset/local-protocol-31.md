---
"@open-tuya/local": minor
---

Speak protocol 3.1: `createLocalTuyaClient` reads and writes a 3.1 device, and `discoverDevices` listens on UDP port 6666 for its broadcasts, so a program holding that port without sharing it now fails discovery with `DISCOVERY_FAILED`. Under a wrong local key a 3.1 read still succeeds and a write times out. `TuyaDiscovery`'s constructor takes its broadcast sockets as a list.
