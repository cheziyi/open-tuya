---
"@open-tuya/local": minor
---

`decodeFrames`, `decodeV34Frames`, `decodeV35Frames` and `decodeMessages` no longer throw for a length field out of range: they return the whole frames before it and set `malformed`, and `TuyaConnection` hands those frames on before it closes. A read by writing null waits for its ack, a closed device behind a gateway is no longer read after a reconnect, and a 3.3 gateway is read with `DP_QUERY_NEW`, written with `CONTROL_NEW` `{"cid","ctype":0,"dps"}`, and asked which devices are online.
