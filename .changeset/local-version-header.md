---
"@open-tuya/local": patch
---

Only `CONTROL` and `CONTROL_NEW` carry the version header, which now holds a serial number and a source ID: `LocalTuyaClient` numbers its writes from 1 under a source ID of its own, and `send`, `encryptV33Payload`, `encryptV34Payload` and `encodeV35Payload` take them as `VersionHeaderFields`. A 3.4 heartbeat goes with no payload, and request bodies list their keys in alphabetical order.
