---
"@open-tuya/local": minor
---

`TuyaConnection.close()` and `LocalTuyaClient.close()` now return a promise that resolves once the socket is released. `TuyaConnection`, `LocalTuyaClient` and `TuyaDiscovery` close at the end of an `await using` scope.
