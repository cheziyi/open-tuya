---
"@open-tuya/core": patch
---

Add `TuyaError`, which every open-tuya package throws, with a `code` for each failure: `MALFORMED_FRAME` and `DECRYPTION_FAILED`.
