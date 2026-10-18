---
"@open-tuya/devices": patch
---

Convert tuya-local's `available` and `invalid`, adding 87 devices. A rule or a condition gains `availableWhile`, the data point that makes it apply, and a condition gains `invalid`, which leaves the control without a value and makes `writeControls` throw `VALUE_UNAVAILABLE` while it holds.
