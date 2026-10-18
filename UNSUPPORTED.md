# Unsupported

What no source pins down. Each entry says what is unknown, and what the code
does until a source or a capture settles it.

## LAN protocol

| What | Unknown | Until then |
| --- | --- | --- |
| A TCP frame from a real 3.4 device, and most 3.3 and 3.5 frames | The sources capture, with their keys, a 3.1 plug's read, write, ack and `STATUS` ([tinytuya#177](https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247544765)), a 3.2 switch's read by writing null, its ack and `STATUS` ([localtuya#1232](https://github.com/rospogrigio/localtuya/issues/1232#issuecomment-1387550394)) and error ([tinytuya#168](https://github.com/jasonacox/tinytuya/issues/168)), a 3.3 device's error ([tuyapi#577](https://github.com/codetheweb/tuyapi/issues/577)), refusal and `STATUS` ([TuyaAPI/cli#109](https://github.com/TuyaAPI/cli/issues/109#issuecomment-767903303)), and a 3.5 device's query and error, after a session key negotiation of frames 0x2c, 0x50 and 0x3c bytes long ([tinytuya#658](https://github.com/jasonacox/tinytuya/issues/658)); for the rest, only decrypted payloads | Tests use those captures, and frames computed by tinytuya's code and checked against tuyapi's |
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
| Whether a 3.3 gateway wants a write as `CONTROL_NEW` `{"cid","ctype":0,"dps"}` | Some 3.3 gateway firmware may take a write to a device behind it so, in place of `CONTROL` `{"cid","dps","t"}`; no source or capture shows one, and none is tested on a real device | A 3.3 write sends `CONTROL` `{"cid","dps","t"}`, as the sources do: see [DESIGN.md](DESIGN.md#gateways) |
| A whole 3.5 push from a device behind a gateway | [tinytuya#493](https://github.com/jasonacox/tinytuya/issues/493) shows its end, `…},"cid":"…"}`, cut short | `cid` is read at the top and in `data` |
| Which 3.3 gateways answer the online query | One did ([tinytuya#302](https://github.com/jasonacox/tinytuya/issues/302#issuecomment-1474957230)); others never answer ([hass-localtuya#293](https://github.com/xZetsubou/hass-localtuya/issues/293)) | A 3.3 gateway is asked as any other; one that never answers leaves its devices connected while it is |
| How a gateway answers `UPDATEDPS` for a device behind it | No source captures it | Not sent, as for any device |
| A gateway's reply to a read with no `cid` | A 3.3 gateway answered "devid not found" ([hass-localtuya#613](https://github.com/xZetsubou/hass-localtuya/issues/613)); some answer "json obj data unvalid" | `readDataPoints` on the gateway's client rejects with `REQUEST_REJECTED`; the simulator answers with its own data points |

## Discovery

| What | Unknown | Until then |
| --- | --- | --- |
| A 3.2 broadcast | Logs show a 3.2 device broadcast to port 6666 in plain text ([homebridge-tuya-lan#83](https://github.com/AMoo-Miki/homebridge-tuya-lan/issues/83#issuecomment-544026484), [homebridge-tuya#156](https://github.com/iRayanKhan/homebridge-tuya/issues/156)); none shows its bytes or its command | `discoverDevices` reports one framed as a 3.1 broadcast is, and leaves out any other; the simulator sends none |
| Which port a 3.4 device broadcasts to | The captured 3.4 broadcasts ([hass-localtuya `aeb5f9c`](https://github.com/xZetsubou/hass-localtuya/commit/aeb5f9ce4c07c57e7868f296978fed4a2a5e9f18)) carry their bytes, not their port | `discoverDevices` reads a broadcast on 6666, 6667 or 7000 alike |
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

The catalog drops two keys of tuya-local's device files that say how a client
polls a data point, as its
[README](https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/devices/README.md#L199-L218)
describes them:

| tuya-local key | Data points | Files | What a client misses |
| --- | --- | --- | --- |
| `force: true` | 319 | 69 | The device reports the data point only on an explicit update request, as an energy plug its power: without one, rarely or never |
| `persist: false` | 293 | 93 | The data point signals an event, so its value is forgotten when a full poll leaves it out, and the same value sent again is a new event |

tuya-local's files give 10 controls in 9 files nothing that tells them from
another control of their name, so each takes an ordinal by its place in the
file, as [DESIGN.md](DESIGN.md#catalog) decides:

| Control | Device files | Unknown |
| --- | --- | --- |
| `secondAlarm` | aixishs_big_siren, gautone_pg103_alarm, kerui_120db_sirenalarm | How an alarm event differs from the alarm binary sensor on another data point: both are named "Alarm", and where the sensor's class is sound, `alarmSound` already names the alarm sound switch |
| `secondStatus` | ipengen_goe3116a_evcharger, ipengen_goe3132a_evcharger | What a status sensor's `status` data point reports beside its own value |
| `secondColorBrightness` | asahom_outdoor_rgbcw_lights | How a light's `color_brightness` data point differs from the brightness in its colour |
| `secondWaterTemperature` | kogan_bidet | What a water temperature number's `temperature` data point holds beside its value |
| `secondFault`, `secondFaultCode` | rohnson_r9530_dehumidifier | How a fault event and its fault code differ from the fault binary sensor and its fault code |
| `secondRealTime` | single_phase_clamp_meter | How a "Real time" event differs from the "Real time" select beside it |

`@open-tuya/devices` converts a tuya-local device file whole or not at all.
These use a feature the conversion does not take yet, and are left out of the
catalog until it does.

<!-- Generated by packages/devices/scripts/importTuyaLocal.ts. -->

| tuya-local feature | Devices | Device files |
| --- | --- | --- |
| a `mask` of an odd number of hex digits on a control that can be written | 2 | cecotec_congax70_vacuum, mirabella_geniopixel_light |
| not valid YAML | 1 | poolsana_heatpump |

<!-- End of generated list. -->
