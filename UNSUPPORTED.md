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
| What a 3.1 device acks a write it refuses with | A plug acked a write with an empty payload and return code 0, and ignored writes under a wrong key ([tinytuya#177](https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247544765)); no source shows a refusal | `LocalTuyaClient` judges an ack by its payload alone, as on 3.3 |
| What `s` in a 3.1 push counts | A plug's pushes carry it, rising ([tinytuya#177](https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247504813)); no source reads it | `@open-tuya/local` reads `dps` alone; the simulator sends no `s` |
| A 3.4 or 3.5 device that refuses a read | Which body reads it by writing null: one 3.4 device answered tinytuya's 3.3 body over `CONTROL_NEW` ([tinytuya#597](https://github.com/jasonacox/tinytuya/issues/597)), others nothing ([tinytuya#589](https://github.com/jasonacox/tinytuya/issues/589)); no source shows a 3.5 device | `readByWritingNull` throws a `TypeError` on 3.4 and 3.5; `readDataPoints` rejects with `REQUEST_REJECTED` |
| Whether a 3.2 device answers a read in plain text, and with what | A switch answered an encrypted one with "data format error" ([tinytuya#168](https://github.com/jasonacox/tinytuya/issues/168)); no capture shows a plain one | `LocalTuyaClient` sends it in plain text, and a refusal rejects with `REQUEST_REJECTED`; the simulator answers `{"dps":…}` unless it refuses reads |
| Which data points a null write is safe on | It changed a camera's settings and formatted its memory card ([tinytuya#408](https://github.com/jasonacox/tinytuya/issues/408)); no source tells such a data point from one that holds a state | A client reads so only the data points its caller names in `readByWritingNull` |

## Gateways

| What | Unknown | Until then |
| --- | --- | --- |
| A 3.1 or 3.2 gateway | No source shows one reach the devices behind it | `createClient(nodeId)` on a 3.1 or 3.2 client throws a `TypeError` |
| Whether a 3.4 or 3.5 gateway needs `ctype` in a write | tinytuya and tuyapi send `ctype: 0`; hass-localtuya does not; no capture shows a gateway refuse either | A write sends `ctype: 0` |
| A whole 3.5 push from a device behind a gateway | [tinytuya#493](https://github.com/jasonacox/tinytuya/issues/493) shows its end, `…},"cid":"…"}`, cut short | `cid` is read at the top and in `data` |
| Which 3.3 gateways answer the online query | One did ([tinytuya#302](https://github.com/jasonacox/tinytuya/issues/302)); others never answer ([hass-localtuya#293](https://github.com/xZetsubou/hass-localtuya/issues/293)) | A 3.3 gateway is not asked |
| How a gateway answers `UPDATEDPS` for a device behind it | No source captures it | Not sent, as for any device |
| A gateway's reply to a read with no `cid` | A 3.3 gateway answered "devid not found" ([hass-localtuya#613](https://github.com/xZetsubou/hass-localtuya/issues/613)); some answer "json obj data unvalid" | `readDataPoints` on the gateway's client rejects with `REQUEST_REJECTED`; the simulator answers with its own data points |

## Discovery

| What | Unknown | Until then |
| --- | --- | --- |
| A 3.2 broadcast | Logs show a 3.2 device broadcast to port 6666 in plain text ([homebridge-tuya-lan#83](https://github.com/AMoo-Miki/homebridge-tuya-lan/issues/83#issuecomment-544026484), [homebridge-tuya#156](https://github.com/iRayanKhan/homebridge-tuya/issues/156)); none shows its bytes or its command | `discoverDevices` reports one framed as a 3.1 broadcast is, and leaves out any other; the simulator sends none |
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

## Tuya developer platform

| What | Unknown | Until then |
| --- | --- | --- |
| A captured `shadow/properties/issue` request and its answer | Tuya calls the endpoint ([tuya-connector](https://github.com/tuya/tuya-connector/commit/25424c594135e8c5f4c684a0b7cce8fc7b4fcca6)) and documents its values in the thing model's own terms ([tuya-openclaw-skills](https://github.com/tuya/tuya-openclaw-skills/commit/79292c594cfba383555b4f465e835132136f0ea6)), but no capture shows one | A write sends the caller's values as they are |
| A device's protocol version and LAN address | No response carries the version, and `ip` is the address the cloud sees | `listDevices` reports neither; `discoverDevices` does |
| A pushed message's `sign` | No source computes it | It is ignored; the GCM tag stands for it |
| A push other than protocol 4 | Protocol 20 carries `online`, `offline` and other events ([tuya-homebridge#401](https://github.com/tuya/tuya-homebridge/issues/401)); `TuyaClient` has nothing to hand them to | They are ignored |
| Whether `/v1.0/users/{uid}/devices` pages | No source or capture shows a page past the first | `listDevices` with `viaDeviceId` reads one page |

## Device catalog

`@open-tuya/devices` converts a tuya-local device file whole or not at all.
These use a feature the conversion does not take yet, and are left out of the
catalog until it does.

<!-- Generated by packages/devices/scripts/importTuyaLocal.ts. -->

| tuya-local feature | Devices | Device files |
| --- | --- | --- |
| `format` on a data point that is not hex or base64 | 1 | depuley_smart_ceiling_fan |
| a `constraint` read through a mask or a mapping | 3 | inkbird_ibs_m1s, nedis_pilldispenser, owon_pc341_energymeter |
| a `mask` of an odd number of hex digits on a control that can be written | 2 | cecotec_congax70_vacuum, mirabella_geniopixel_light |
| a condition's mapping of the value while absent | 2 | realme_techlife_vacuum, tefal_xplorer_vacuum |
| more than one default mapping | 1 | orbegozo_rrw_emisor_termico |
| not valid YAML 1.2 | 1 | poolsana_heatpump |

<!-- End of generated list. -->
