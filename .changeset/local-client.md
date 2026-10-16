---
"@open-tuya/local": minor
---

Add `createLocalTuyaClient`, which reads and writes a device's data points over the LAN, hands on what the device reports, and reconnects after a loss. A 3.5 frame's `returnCode` is now read little-endian, as a device writes it.
