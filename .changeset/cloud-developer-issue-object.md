---
"@open-tuya/cloud-developer": patch
---

`writeDataPoints` issues `properties` as an object, as Tuya's own connector does, and `readDataPoints` leaves out a shadow property whose `dp_id` is null.
