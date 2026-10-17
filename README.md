# open-tuya

Unofficial Node.js and TypeScript libraries for controlling Tuya devices
three ways: over the local network (LAN), through the Tuya developer platform,
and through the cloud the Smart Life app signs in to.

## Goal

Tuya documents only its developer platform. A dozen open-source projects
([credits](#credits)) have each worked out the rest: the LAN protocol and its
versions, the Smart Life app's cloud, and what each device's data points mean.
Each holds fixes the others lack.

open-tuya gathers what they found, with additional reverse engineering of its
own, into one library that any project can build on, whether a Homebridge or
Matterbridge plugin or a script. Each protocol fact taken from a project links
the commit or pull request it came from, so a fix found here can be traced
back, and one found there can be brought in.

## Packages

Install `open-tuya` unless you need only one part of it.

| Package | Use it to |
| --- | --- |
| [`open-tuya`](packages/open-tuya) | Discover devices, and read and write their data points by name, over any of the three |
| [`@open-tuya/local`](packages/local) | Discover devices on the LAN and control them there |
| [`@open-tuya/cloud-developer`](packages/cloud-developer) | List devices with their local keys, and control them, through the Tuya developer platform, signed in with a developer project's access ID and secret |
| [`@open-tuya/cloud-app`](packages/cloud-app) | The same, through the Smart Life app's cloud, signed in by scanning a QR code with the app |
| [`@open-tuya/devices`](packages/devices) | Look up what each data point of a device controls |
| [`@open-tuya/simulators`](packages/simulators) | Test your code against a simulated device |
| [`@open-tuya/mqtt`](packages/mqtt) | Nothing directly: it holds the MQTT client both clouds receive pushes through |
| [`@open-tuya/core`](packages/core) | Nothing directly: it holds the types and errors the others share |

[DESIGN.md](DESIGN.md#packages) says why it is split this way.

## Signing in to the Smart Life cloud

Pass Home Assistant's client ID and schema: they are the only pair known to
work, so `@open-tuya/cloud-app` signs in as Home Assistant does.

```ts
import { createCloudAppAccount, createQrLogin } from "@open-tuya/cloud-app";

const clientId = "HA_3y9q4ak7g4ephrvke";
const login = createQrLogin({
  clientId,
  schema: "haauthorize",
  userCode, // Smart Life app > Settings > Account and Security > User Code
});
const qrCode = await login.requestQrCode(); // show it as a QR code
const session = await login.waitForScan(qrCode);

const account = createCloudAppAccount({
  clientId,
  session,
  onSessionChange: save, // persist each one: its refresh token works once
});
const devices = await account.listDevices(); // deviceId, localKey, productKey
await using client = await account.createClient(devices[0].deviceId);
```

The client keys data points by ID, as the LAN does, and reads and writes only
those the cloud passes through unchanged:
[DESIGN.md](DESIGN.md#cloud-app-data-points) says why. The cloud gives no
LAN address or protocol version: take those from `discoverDevices`.

## Signing in to the Tuya developer platform

Create a cloud project on [platform.tuya.com](https://platform.tuya.com), link
your Smart Life app account to it under Devices > Link App Account, and pass
the project's access ID and secret with the data center the account is in.

```ts
import { createDeveloperCloudAccount } from "@open-tuya/cloud-developer";

const account = createDeveloperCloudAccount({
  accessId,
  accessSecret,
  dataCenter: "eu", // cn, us, us-e, eu, eu-w, in or sg
});
const devices = await account.listDevices(); // deviceId, localKey, productKey
await using client = await account.createClient(devices[0].deviceId);
```

The client keys data points by ID with the device's own values, through the
device's thing model. A request that rejects with `PERMISSION_DENIED` needs a
fix on the platform:

| The cloud's answer | Fix |
| --- | --- |
| 28841002, "subscription to cloud development plan has expired" | Extend the project's IoT Core trial |
| 28841101, 28841105, 28841106 | Authorize the API service the message names |
| 1106 to `listDevices()` | Pass `{ viaDeviceId }` with any device of the account |
| 2007, or no devices | Pick the data center the app account is in |

## Development

Requires Node 22.19 or later and pnpm.

```sh
pnpm install
pnpm test
pnpm check
pnpm clone-reference   # clone or update every project under Credits into reference/
```

## Credits

The code cites the commit or pull request each protocol fact comes from. A
fact none of these projects shows comes from open-tuya's own reverse
engineering.

| Project | License | Covers |
| --- | --- | --- |
| [jasonacox/tinytuya](https://github.com/jasonacox/tinytuya) | MIT | Local protocol, discovery, developer platform API, Python |
| [codetheweb/tuyapi](https://github.com/codetheweb/tuyapi) | MIT | Local protocol, discovery, Node.js |
| [clach04/python-tuya](https://github.com/clach04/python-tuya) | MIT | Local protocol, Python; the origin of localtuya's protocol code |
| [rospogrigio/localtuya](https://github.com/rospogrigio/localtuya) | GPL-3.0 | Local protocol, Home Assistant |
| [xZetsubou/hass-localtuya](https://github.com/xZetsubou/hass-localtuya) | GPL-3.0 | Local protocol, Home Assistant; the maintained fork of rospogrigio/localtuya; the developer platform's thing model |
| [mileperhour/localtuya-homeassistant](https://github.com/mileperhour/localtuya-homeassistant) | GPL-3.0 | Local protocol, Home Assistant; localtuya was forked from it |
| [AMoo-Miki/homebridge-tuya-lan](https://github.com/AMoo-Miki/homebridge-tuya-lan) | MIT | Local protocol, Homebridge |
| [iRayanKhan/homebridge-tuya](https://github.com/iRayanKhan/homebridge-tuya) | MIT | Local protocol, Homebridge |
| [adrianjagielak/homebridge-tuya-plus](https://github.com/adrianjagielak/homebridge-tuya-plus) | MIT | Fork of iRayanKhan/homebridge-tuya; developer platform API, its thing model and its pushed device updates |
| [Apollon77/ioBroker.tuya](https://github.com/Apollon77/ioBroker.tuya) | MIT | Local protocol through tuyapi, and a collection of device data point schemas, ioBroker |
| [simensma/tuyamqtt](https://github.com/simensma/tuyamqtt) | None | Local protocol, MQTT gateway |
| [iamjond/tuyagateway](https://github.com/iamjond/tuyagateway) | Unlicense, over code forked from simensma/tuyamqtt | Local protocol, MQTT gateway |
| [TuyaAPI/stub](https://github.com/TuyaAPI/stub) | MIT | A device answering the local protocol, for tests |
| [tuya/tuya-connector-nodejs](https://github.com/tuya/tuya-connector-nodejs) | MIT, in `package.json` only | Developer platform API, by Tuya |
| [tuya/tuya-homebridge](https://github.com/tuya/tuya-homebridge) | MIT | Developer platform API and its pushed device updates, Homebridge, by Tuya |
| [TuyaAPI/cli](https://github.com/TuyaAPI/cli) | MIT | Fetching local keys from the developer platform API |
| [tuya/tuya-iot-python-sdk](https://github.com/tuya/tuya-iot-python-sdk) | MIT, Copyright (c) 2014-2021 Tuya Inc. | Developer platform API and its pushed device updates, Python, by Tuya |
| [tuya/tuya-device-sharing-sdk](https://github.com/tuya/tuya-device-sharing-sdk) | MIT, Copyright (c) 2023 Tuya | Smart Life app QR login and its pushed device updates, by Tuya |
| [make-all/tuya-local](https://github.com/make-all/tuya-local) | MIT | Device catalog, Home Assistant; its local protocol is tinytuya's and its QR login tuya-device-sharing-sdk's |
| [home-assistant-libs/tuya-device-handlers](https://github.com/home-assistant-libs/tuya-device-handlers) | MIT | Fixes to the data points of misbehaving devices, by product |
| [home-assistant/core `components/tuya`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/tuya) | Apache-2.0 | Standard data point codes by device category, Home Assistant |
| [tuya/TuyaOpen `src/tuya_cloud_service`](https://github.com/tuya/TuyaOpen/tree/master/src/tuya_cloud_service) | Apache-2.0 | A device's own side of the LAN protocol: what it answers to each command, by Tuya |

Projects not under MIT contribute protocol facts only, never code:
[AGENTS.md](AGENTS.md#sources) says how. A project built on another, such as
tuya-local on tinytuya, does not agree with it independently.

## License

MIT
