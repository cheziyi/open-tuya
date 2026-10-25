---
"@open-tuya/simulators": patch
---

A simulated 3.3 or 3.4 device sends an empty payload, as a write ack's or a heartbeat reply's, as no bytes, as a device does, rather than as one padded block.
