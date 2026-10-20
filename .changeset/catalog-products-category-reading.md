---
"@open-tuya/devices": minor
"open-tuya": minor
---

Replace a catalog entry's `productKeys` with `products`, each with its `productKey`, `manufacturer`, `model` and `modelId`, and give each control the `category` and each sensor the `reading` tuya-local gives it. tuya-local renamed four device files, so their entries' `source.file` changed: `CT20W_pir_motion_detector.yaml` is `ct20w_motiondetector.yaml`, `tuya_smart_zigbee_door_sensor.yaml` is `mirabella_genio_doorsensor.yaml`, `setti_czajnik_kettle.yaml` is `setti_kt950w_kettle.yaml` and `ZC34T-03-3A_swing_arm_opener.yaml` is `zc34t033a_swingarmopener.yaml`.
