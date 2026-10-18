---
"@open-tuya/cloud-app": patch
---

A success from the cloud whose result lacks a field the request needs rejects with a `TuyaError` with code `REQUEST_REJECTED`, not a `TypeError`. A push that cannot be read is dropped, and a listener's throw is rethrown after the other listeners have the push, so neither reaches MQTT.js.
