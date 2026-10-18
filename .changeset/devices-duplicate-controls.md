---
"@open-tuya/devices": patch
---

Give a data point that two entities expose one control, as a climate's `temperatureUnit` in `C` and `F`, and tell apart two controls of one name by what they do, as `currentSettingInA` beside `currentInA`, `scheduleEnabled` beside `schedule`, or `device.on` beside `light.on`, with an ordinal, as `secondStatus`, only where nothing does. A control another reads its unit from reads `C` and `F`, not `celsius`, `°C` or `c`.
