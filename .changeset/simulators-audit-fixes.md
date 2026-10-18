---
"@open-tuya/simulators": patch
---

`SimulatedTuyaDevice` serves 3 clients at once and closes a fourth's connection, closes a connection idle for 30 s, closes a 3.5 connection on a sequence number not above the last, answers a 3.5 query with `devId` and a 3.3 gateway's online query, and throws a `TuyaError` or a `TypeError` where it threw an `Error`.
