# Unsupported

What no source pins down. Each entry says what is unknown, and what the code
does until a source or a capture settles it.

## LAN protocol

| What | Unknown | Until then |
| --- | --- | --- |
| A TCP frame from a real 3.4 device, a session key negotiation, and most 3.3 and 3.5 frames | The sources capture a 3.3 error, and a 3.5 query and its error, with their keys; for the rest, only decrypted payloads | Tests use those three, and frames computed by tinytuya's code and checked against tuyapi's |
| The largest frame a device sends | No source or capture shows it | `@open-tuya/local` closes the connection on a length field over 102,400: see [DESIGN.md](DESIGN.md#received-frames) |
| Which frames a device puts the version header on, and what the 12 bytes after the version hold | Clients look for the header on any frame and skip all 15 bytes | The simulator puts it on `STATUS` alone, with the 12 bytes zero |
| What a 3.3 device sends back for a frame under the wrong key | tinytuya's scanner says "an encrypted rejection message"; no source shows its bytes | The simulator ignores the frame |
| The return code on a 3.4 device's write ack | 3.3 devices send 0, and Tuya's 3.5 firmware sends 1 even on success; no source shows 3.4 | The simulator sends 0; `LocalTuyaClient` judges an ack by its payload alone |
| A device that answers a read with "json obj data unvalid" (device22) | Which command reads it instead (CONTROL in tuyapi, CONTROL_NEW in localtuya), on which versions, and which data points to ask for. Tuya's 3.5 firmware sends the text when it has nothing to report yet, and on one camera the query that reads it changed its settings ([tinytuya#408](https://github.com/jasonacox/tinytuya/issues/408)) | `readDataPoints` rejects with `REQUEST_REJECTED` |
