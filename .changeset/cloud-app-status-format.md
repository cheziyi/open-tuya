---
"@open-tuya/cloud-app": patch
---

`AppCloudTuyaClient.readDataPoints` finds each data point under the code its relation's `statusFormat` names, so it reads a data point whose status code differs from its command code, such as `energy_reset` for `clear_energy`.
