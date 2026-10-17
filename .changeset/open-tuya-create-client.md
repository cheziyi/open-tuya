---
"open-tuya": patch
---

Add `createTuyaClient`, which reaches a device over the LAN and either cloud in the order you give, falls back to the next route when one fails, and reads and writes its controls by name from the device catalog; re-export every package but `@open-tuya/simulators`.
