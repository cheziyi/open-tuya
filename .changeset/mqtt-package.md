---
"@open-tuya/mqtt": patch
---

Add the MQTT client the cloud packages receive pushed device updates through, with `MqttSession`, which renews its credentials before they expire and reconnects after a loss.
