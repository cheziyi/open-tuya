---
"@open-tuya/core": minor
"@open-tuya/cloud-app": patch
"@open-tuya/cloud-developer": patch
"@open-tuya/devices": minor
"open-tuya": minor
---

`readDeviceModel(deviceId)` on either cloud's account gives the standard code, type and values of each of a device's data points, and `createDeviceEntry(model, { category, name })` builds an entry from it for a device the catalog does not list; `createTuyaClient` does so itself when given the new `category` option and a cloud route. `TuyaCloudAccount` gains `readDeviceModel`, so a class implementing it must add it, and `TuyaDeviceEntry.source` is optional, absent on an entry built from a model.
