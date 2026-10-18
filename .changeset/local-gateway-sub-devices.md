---
"@open-tuya/local": patch
---

Reach the devices behind a gateway, such as Zigbee and Bluetooth devices, over the gateway's connection: `LocalTuyaClient.createClient(nodeId)` gives a `SubDeviceTuyaClient`, and on 3.4 and 3.5 the gateway is asked every 30 s which devices are online.
