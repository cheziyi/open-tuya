---
"@open-tuya/devices": patch
---

Convert tuya-local's `constraint` and `conditions`, adding 167 devices, mostly heaters, thermostats, heat pumps, vacuums and air conditioners. A mapping or a control gains `dependsOn`, the conditions another data point picks between; `writeControls` can set that data point too, and throws `VALUE_UNAVAILABLE` for a value it cannot set while that data point holds what it does; `listDependencies` lists the data points a control depends on.
