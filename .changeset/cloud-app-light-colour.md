---
"@open-tuya/cloud-app": patch
---

A light's colour reads and writes through the Smart Life cloud. A data point the cloud converts with `dj_v2_color_alg` is read and written as the device's own twelve hex digits, where a read left it out and a write rejected with `UNMAPPED_DATA_POINT`, so a light reached through this cloud alone took no colour.
