---
"@open-tuya/devices": minor
---

Convert tuya-local's `value_redirect`, `value_mirror` and a rule's own `range`, adding 213 devices. A rule gains `redirect` and `mirror`, the data point it reads, and writes, instead; a condition gains `min` and `max`; `resolveControl` gives a control's range, scale and step as the device's data points make them. `absent` is renamed `whenAbsent` and becomes a rule: read `control.whenAbsent?.value` where you read `control.absent`.
