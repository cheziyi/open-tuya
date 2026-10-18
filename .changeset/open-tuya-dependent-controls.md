---
"open-tuya": patch
---

`RoutedTuyaClient.onControls` reports a control again when a data point it depends on changes, and `writeControls` reads the device first when it does not know such a data point yet.
