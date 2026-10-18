---
"@open-tuya/devices": patch
---

Give a data point that two entities expose one control, as a climate's `temperatureUnit` in `C` and `F`, and tell apart two controls of one name by what they do, as `currentSettingInA` beside `currentInA`, `scheduleEnabled` beside `schedule`, or `device.on` beside `light.on`, with an ordinal, as `secondStatus`, only where nothing does. A temperature unit reads `C` and `F`, not `celsius`, `°C` or `c`. Writing a boolean's rule for any other raw value writes the boolean no mapping names, as `false` for `C` where `true` is `F`, and a value no rule takes follows the current raw value's redirect before it is refused.
