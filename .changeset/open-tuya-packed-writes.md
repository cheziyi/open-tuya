---
"open-tuya": patch
---

`RoutedTuyaClient.writeControls` keeps the other bits of a masked control's data point from what the device last reported, reading it first when it has not, and runs one write at a time.
