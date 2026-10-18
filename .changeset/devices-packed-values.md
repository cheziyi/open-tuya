---
"@open-tuya/devices": patch
---

Convert tuya-local's `mask` and `format`, adding 134 devices: energy meters, EV chargers, breakers and colour lights. A control gains `mask`, `maskSigned` and `littleEndian`, a light's colour reads as `hue`, `saturation` and `colorBrightness`, and `writeControls` takes the device's current data points, which a masked control keeps the other bits of.
