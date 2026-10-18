---
"@open-tuya/devices": patch
---

Convert tuya-local's `value_redirect`, `value_mirror` and a rule's own `range`, adding 213 devices. A rule gains `redirect` and `mirror`, the data point it reads, and writes, instead; a condition gains `min` and `max`; a control's `whenAbsent` is the rule it reads by while the device leaves its data point out; `resolveControl` gives a control's range, scale and step as the device's data points make them.
