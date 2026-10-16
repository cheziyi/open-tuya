---
"@open-tuya/local": minor
---

Add `openConnection`, which opens a `TuyaConnection` to a 3.3, 3.4 or 3.5 device, agrees the session key, and keeps the connection alive with heartbeats. `decodeFrames`, `decodeV34Frames` and `decodeV35Frames` no longer throw for a frame whose CRC, HMAC or tag is wrong: they leave it out and return its error in `errors`. They accept a length field up to 102,400, not 1440.
