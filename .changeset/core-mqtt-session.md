---
"@open-tuya/core": patch
---

`MqttSession` keeps doubling its wait after each connection the broker drops before its renewal, renews credentials no sooner than 60 s and no later than about 24.8 days after connecting, connects nothing once closed, and resolves `close()` only once every connection it opened is released.
