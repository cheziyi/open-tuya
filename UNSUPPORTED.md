# Unsupported

What no source pins down. Each entry says what is unknown, and what the code
does until a source or a capture settles it.

## LAN protocol

| What | Unknown | Until then |
| --- | --- | --- |
| A TCP frame from a real 3.4 device, a session key negotiation, and most 3.3 and 3.5 frames | The sources capture a 3.3 error, and a 3.5 query and its error, with their keys; for the rest, only decrypted payloads | Tests use those three, and frames computed by tinytuya's code and checked against tuyapi's |
| The largest frame a device sends | No source or capture shows it | `@open-tuya/local` closes the connection on a length field over 102,400: see [DESIGN.md](DESIGN.md#received-frames) |
| Which frames a device puts the version header on | Tuya's firmware puts it on its pushes; clients look for it on any frame | The simulator puts it on `STATUS` alone |
| What a 3.3 device sends back for a frame under the wrong key | tinytuya's scanner says "an encrypted rejection message"; no source shows its bytes | The simulator ignores the frame |
| The return code on a 3.4 device's write ack | 3.3 devices send 0, and Tuya's 3.5 firmware sends 1 even on success; no source shows 3.4 | The simulator sends 0; `LocalTuyaClient` judges an ack by its payload alone |
| A device that answers a read with "json obj data unvalid" (device22) | Which command reads it instead (CONTROL in tuyapi, CONTROL_NEW in localtuya), on which versions, and which data points to ask for. Tuya's 3.5 firmware sends the text when it has nothing to report yet, and on one camera the query that reads it changed its settings ([tinytuya#408](https://github.com/jasonacox/tinytuya/issues/408)) | `readDataPoints` rejects with `REQUEST_REJECTED` |

## Discovery

| What | Unknown | Until then |
| --- | --- | --- |
| A 3.1 or 3.2 broadcast | The one raw 3.1 broadcast captured has its product key cut short, so its CRC cannot be checked ([hass-localtuya#95](https://github.com/xZetsubou/hass-localtuya/pull/95)); no source captures a 3.2 one | `discoverDevices` does not listen on port 6666, and leaves out a device of either version |
| How often a device broadcasts | No source's code says. Users saw 3 to 6 s ([tuyapi#5](https://github.com/codetheweb/tuyapi/issues/5#issuecomment-348253790)), and some devices stop while a client is connected ([tinytuya#731](https://github.com/jasonacox/tinytuya/issues/731#issuecomment-5318435027)) | `discoverDevices` reports each broadcast as it comes; the simulator broadcasts when a test tells it to |
| What `token`, `wf_cfg` and `clientLink` in a broadcast mean | No source reads them | `discoverDevices` does not report them |
| Whether a 3.3 or 3.4 device answers a request | Only 3.5 firmware shows a device taking one | The simulator answers on 3.5 alone |
| A device's answer to a request, as bytes | Tuya's firmware builds it as its broadcast ([`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1)); no capture shows one | The simulator answers with its broadcast |

## Smart Life cloud

| What | Unknown | Until then |
| --- | --- | --- |
| A device's protocol version and LAN address | No field carries the version, and `ip` is the address the cloud sees, behind the home's router ([tuya-local](https://github.com/make-all/tuya-local/blob/22b2d4edcd0f266889d3b675118639cb90ed2e09/custom_components/tuya_local/config_flow.py#L345)) | `listDevices` reports neither; `discoverDevices` does |
| What a poll answers before the QR code is scanned, and how long a QR code lasts | Home Assistant and tuya-local check once, when the user says they scanned; Home Assistant says the code "expires in minutes" | `waitForScan` polls on through every answer but `E0020002` |
| A data point the cloud converts other than with `"default"` | Each conversion turns the device's value into the cloud's; no source turns it back | A read leaves it out, and a write rejects with `UNMAPPED_DATA_POINT`. A push carries it, as the device's own value |
| A device of a custom type, or with a relation that does not support local | The SDK then trusts none of its relations and listens to its `/sta` topic by code; no source shows how those codes map to IDs | The client maps no data point and subscribes to no push |
| The response's `sign` | No source computes it | It is ignored |
| Whether the cloud reads the MQTT link ID | The SDK sends `tuya-device-sharing-sdk-python.` and a UUID; no source sends another | The account sends the same form |
| A signed request whole | A log shows the response, never the request ID and refresh token that sign it | Tests use requests computed by the SDK's own code |
| A push other than protocol 4 | No capture shows one | It is ignored |
