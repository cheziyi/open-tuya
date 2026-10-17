---
"@open-tuya/core": minor
---

`TuyaClient.close()` now returns a promise that resolves once the client's connections are released, and `TuyaClient` extends `AsyncDisposable`, so `await using` closes a client.
