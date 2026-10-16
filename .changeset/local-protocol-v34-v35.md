---
"@open-tuya/local": patch
---

Add protocol 3.4 and 3.5 framing and encryption (`encodeV34Frame`, `decodeV34Frames`, `encryptV34Payload`, `decryptV34Payload`, `encodeV35Frame`, `decodeV35Frames`, `encodeV35Payload`, `decodeV35Payload`) and the pieces of the session key negotiation (`parseSessionKeyResponse`, `buildSessionKeyFinish`, `deriveV34SessionKey`, `deriveV35SessionKey`). `decodeFrames` now throws `MALFORMED_FRAME` for a frame whose CRC is wrong, and 3.3 sends `DP_QUERY_NEW` without the version header.
