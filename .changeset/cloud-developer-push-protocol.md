---
"@open-tuya/cloud-developer": patch
---

A pushed report with no `protocol` field is handed on, and a subscription the broker refuses closes the MQTT connection, so the account connects again with fresh credentials.
