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
| [`@open-tuya/core`](packages/core) | Nothing directly: it holds the types and errors the others share |

[DESIGN.md](DESIGN.md#packages) says why it is split this way.

## Reaching a device

Sign in to a cloud for the local keys, listen for the devices on the LAN, and
pass the routes in the order to try them:

```ts
import { setTimeout } from "node:timers/promises";
import { createTuyaClient, type DiscoveredTuyaDevice, discoverDevices } from "open-tuya";

const found = new Map<string, DiscoveredTuyaDevice>();
const discovery = await discoverDevices({
  onDevice: (device) => found.set(device.deviceId, device),
});
const [device] = await account.listDevices(); // either cloud's account: see below
await setTimeout(10_000); // a device broadcasts every few seconds
await discovery.close();

const lan = found.get(device.deviceId);
await using client = await createTuyaClient({
  deviceId: device.deviceId,
  productKey: device.productKey,
  routes: [
    ...(lan && device.localKey
      ? [{ lan: { host: lan.host, version: lan.version, localKey: device.localKey } }]
      : []),
    { cloud: account },
  ],
});
await client.readControls(); // { device: { on: true, … }, backlight: { on: false } }
await client.writeControls({ device: { on: false } });
client.onControls((values) => update(values)); // the controls each push carries
```

| When | The client |
| --- | --- |
| A route is not connected, such as the LAN while it reconnects | Skips it, unless it is the last |
| A read fails | Tries the next route |
| A write fails with `CONNECTION_FAILED`, `SESSION_KEY_NEGOTIATION_FAILED`, `RATE_LIMITED`, `SESSION_EXPIRED`, `PERMISSION_DENIED` or `UNMAPPED_DATA_POINT` | Tries the next route |
| A write fails otherwise, such as a timeout | Rejects with that error: the device may have taken it |
| Every route it tried failed | Rejects with that route's error, or with `ROUTES_FAILED` when it tried several, each route's error in `cause.errors` |
| Two routes push the same change | Hands on the first connected route's push alone |

The LAN route keeps its `host`: when discovery reports a new one, create a
new client. A device with a `nodeId`, reached through a gateway, takes a cloud
route alone: `@open-tuya/local` does not address a gateway's devices yet.

`client.entry` is the catalog entry the controls are named by, the best of
`client.entries`. Save its `source.file` and pass the entry next time, so the
client uses it without matching again:
`entry: CATALOG.find((entry) => entry.source.file === saved)`. A device the
catalog lacks has no `entry`: read and write its data points by ID.
[DESIGN.md](DESIGN.md#routes) says why the client routes this way.

## Naming data points

`@open-tuya/devices` holds 1,172 devices converted from
[tuya-local](https://github.com/make-all/tuya-local). Without
`createTuyaClient`, find a device's entry, then read and write its data
points by name:

```ts
import { findDeviceEntries, readControls, writeControls } from "@open-tuya/devices";

const dataPoints = await client.readDataPoints();
const [entry] = findDeviceEntries({ productKey, dataPoints });
readControls(entry, dataPoints);
// { device: { on: true, voltageInV: 230.5, powerInW: 12.3, timerInSeconds: 0 } }
await client.writeDataPoints(writeControls(entry, { device: { on: false } }, dataPoints));
```

Pass `writeControls` the data points the device reports now: a control with a
`mask`, such as a light's `hue`, sets some bits of its data point and keeps
the rest from them. A value is the device's own, in the unit its name carries. A name the
catalog gives alike across devices is in `CONTROL_NAMES`; any other is the
control's own, and its `kind` and `measures` say how to handle it.
`UNSUPPORTED.md` lists the devices not converted yet.

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
| [tuya/tuya-connector](https://github.com/tuya/tuya-connector) | Apache-2.0 | Developer platform API and its thing model, Java, by Tuya |
| [tuya/tuya-openclaw-skills](https://github.com/tuya/tuya-openclaw-skills) | MIT | The thing model and issuing its properties, documented by Tuya |
| [tuya/tuya-device-sharing-sdk](https://github.com/tuya/tuya-device-sharing-sdk) | MIT, Copyright (c) 2023 Tuya | Smart Life app QR login and its pushed device updates, by Tuya |
| [make-all/tuya-local](https://github.com/make-all/tuya-local) | MIT, Copyright 2018 Nik Rolls, 2026 Jason Rumney, 2022-2026 other contributors as listed in its ACKNOWLEDGEMENTS.md | Device catalog, Home Assistant; its local protocol is tinytuya's and its QR login tuya-device-sharing-sdk's |
| [home-assistant-libs/tuya-device-handlers](https://github.com/home-assistant-libs/tuya-device-handlers) | MIT | Fixes to the data points of misbehaving devices, by product |
| [home-assistant/core `components/tuya`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/tuya) | Apache-2.0 | Standard data point codes by device category, Home Assistant |
| [tuya/TuyaOpen `src/tuya_cloud_service`](https://github.com/tuya/TuyaOpen/tree/master/src/tuya_cloud_service) | Apache-2.0 | A device's own side of the LAN protocol: what it answers to each command, by Tuya |

Projects not under MIT contribute protocol facts only, never code:
[AGENTS.md](AGENTS.md#sources) says how. A project built on another, such as
tuya-local on tinytuya, does not agree with it independently.

## License

MIT
