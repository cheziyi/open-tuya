---
"@open-tuya/devices": patch
---

Convert devices that read one data point as more than one type, and `utf16b64` text, adding 94 devices, mostly lights, cameras, pet feeders, doorbells and alarms. A data point gains `otherTypes`, a control reading it as another type gains `type`, and `findDeviceEntries` needs a reported value to fit every type.
