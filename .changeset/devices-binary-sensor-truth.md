---
"@open-tuya/devices": patch
---

A binary sensor always reads `true` or `false`, as Home Assistant shows it: a raw value its device file does not map, such as a fault code, reads `true` rather than the raw value. A bitfield's mapping drops the rules whose raw value is not a number, such as a fault named `e01`, which never matched a value.
