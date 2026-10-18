---
"@open-tuya/devices": patch
---

Read and write data points as tuya-local does: a data point the device leaves out reads by the control's own rule, a `null` value reads as none, a write finds its rule, rounds half to even, sets a constraint through the constraint's own rules and gives the raw value its data point's type, and a value the data point cannot hold throws a `TypeError`. `findDeviceEntries` takes `productKeys`.
