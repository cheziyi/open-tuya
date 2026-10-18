---
"@open-tuya/cloud-app": patch
---

`AppCloudTuyaClient` subscribes to its device's pushes while it has a listener, so a client that only reads and writes opens no MQTT connection. `AppCloudAccount.createClient` rejects with `CONNECTION_LOST` when the account closes while it runs.
