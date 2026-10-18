---
"@open-tuya/cloud-developer": patch
---

A `DeveloperCloudTuyaClient` subscribes to pushes with its first `onDataPoints` listener and unsubscribes with its last, so a client that only reads and writes opens no MQTT connection.
