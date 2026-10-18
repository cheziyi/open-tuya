---
"@open-tuya/devices": patch
---

A binary sensor always reads `true` or `false`, as Home Assistant shows it: a raw value its device file does not map, such as a fault code, reads `true` rather than the raw value, and a value mapped to text, such as a fault's name, reads `true`.
