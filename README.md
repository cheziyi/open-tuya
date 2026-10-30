# open-tuya

[![npm version](https://img.shields.io/npm/v/open-tuya)](https://www.npmjs.com/package/open-tuya)
[![npm downloads](https://img.shields.io/npm/dm/open-tuya)](https://www.npmjs.com/package/open-tuya)
[![CI](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml?query=branch%3Amain)
[![Catalog import](https://img.shields.io/github/actions/workflow/status/cheziyi/open-tuya/import-catalog.yml?branch=main&label=catalog%20import)](https://github.com/cheziyi/open-tuya/actions/workflows/import-catalog.yml)
[![Node version](https://img.shields.io/node/v/open-tuya)](packages/open-tuya/package.json)
[![Types](https://img.shields.io/badge/types-TypeScript-blue)](packages/open-tuya/package.json)
[![License](https://img.shields.io/npm/l/open-tuya)](LICENSE)

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

## Installation

```sh
npm install open-tuya
```

Each package needs Node 22.12 or later, and its types are included:
[DESIGN.md](DESIGN.md#package-manifests) says why 22.12.

Before `1.0.0`, only a minor release (`0.1.x` to `0.2.0`) can require changes
to your code. npm's default `^` range never crosses one, and on a `0.0.x`
version it takes no update at all: install the package again to get one.

## Packages

Install `open-tuya` unless you need only one part of it.

| Package | Use it to |
| --- | --- |
| [`open-tuya`](packages/open-tuya) | Discover devices, and read and write their data points by name, over any of the three |
| [`@open-tuya/local`](packages/local) | Discover devices on the LAN and control them there, on protocol 3.1 to 3.5 |
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
import { createTuyaClient, discoverDevices } from "open-tuya";

await using discovery = await discoverDevices();
const [device] = await account.listDevices(); // either cloud's account: see below
await setTimeout(10_000); // a device broadcasts every few seconds

const lan = discovery.devices.get(device.deviceId);
await using client = await createTuyaClient({
  deviceId: device.deviceId,
  productKey: device.productKey,
  category: device.category,
  routes: [
    ...(lan && device.localKey
      ? [{ lan: { host: lan.host, version: lan.version, localKey: device.localKey, discovery } }]
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
| `createTuyaClient` reads the device to find its catalog entry | Tries every route in order, waiting for the LAN to connect or fail |
| The catalog does not list `productKey`, a cloud route is given, and `category` is one of `MODEL_CATEGORIES` | Asks the cloud for the device's model, and names the controls from it ahead of the entries that fit its data points |
| A route is not connected, such as the LAN while it reconnects | Skips it, unless it is the last |
| A read fails | Tries the next route |
| A write fails with `CONNECTION_FAILED`, `SESSION_KEY_NEGOTIATION_FAILED`, `RATE_LIMITED`, `SESSION_EXPIRED`, `PERMISSION_DENIED` or `UNMAPPED_DATA_POINT` | Tries the next route |
| A write fails otherwise, such as a timeout | Rejects with that error: the device may have taken it |
| Every route it tried failed | Rejects with that route's error, or with `ROUTES_FAILED` when it tried several, each route's error in `cause.errors` |
| Two routes push the same change | Hands on the first connected route's push alone |

Keep the discovery open while the client runs: when the LAN connection is
lost, the client reconnects to the address discovery last heard the device at,
such as one DHCP gave it.

| When | The LAN client |
| --- | --- |
| It is connected, and discovery hears another address | Stays where it is |
| The connection is lost, or a connect fails | Tries the address discovery heard next, unless that is the one that just failed |
| The address discovery heard fails too | Returns to the last address that connected |

[DESIGN.md](DESIGN.md#moved-devices) says why.

On 3.1, a read goes in plain text, so it succeeds under a wrong local key:
a write that rejects with `REQUEST_TIMED_OUT` is the sign.

### A device that refuses a read

A device that answers every read with `REQUEST_REJECTED`, such as "json obj
data unvalid", may report its data points when written null. Every 3.2
device does, and some 3.3 ones. Name the data points to read so, on 3.2 or
3.3:

```ts
{ lan: { host, version: "3.3", localKey, readByWritingNull: ["1", "2", "3"] } }
```

A null write changes some devices: one camera formatted its memory card. Name
only data points that hold a state, such as a switch or a temperature, never
one that acts, and only for a device that refuses a read: the same text
also comes from a device with nothing to report yet, such as one just powered
on. [DESIGN.md](DESIGN.md#reading-by-writing-null) says why the client never
reads so by itself.

### A device behind a gateway

A device with a `nodeId`, such as a Zigbee or Bluetooth device, is reached
through its gateway's connection, under the gateway's local key. The cloud
names no gateway for it: take the device it lists with the same local key and
no `nodeId`.

```ts
const gateway = devices.find((candidate) => !candidate.nodeId && candidate.localKey === device.localKey);
const found = gateway && discovery.devices.get(gateway.deviceId);
if (!gateway?.localKey || !found || !device.nodeId) {
  throw new Error("No gateway for the device was heard on the LAN");
}
await using hub = createLocalTuyaClient({
  deviceId: gateway.deviceId,
  host: found.host,
  version: found.version,
  localKey: gateway.localKey,
  discovery,
});
await using client = await createTuyaClient({
  deviceId: device.deviceId,
  productKey: device.productKey,
  routes: [{ gateway: hub, nodeId: device.nodeId }, { cloud: account }],
});
```

One gateway client serves every device behind it: create it once and close it
yourself, as `createTuyaClient` leaves it open. The devices behind it follow
it to a new address. It asks the gateway every 30 s which devices are online,
so a device the gateway reports offline goes to the next route.

`client.entry` is the catalog entry the controls are named by, the best of
`client.entries`. Save its `source.file` and pass the entry next time, so the
client uses it without matching again:
`entry: CATALOG.find((entry) => entry.source.file === saved)`. A device the
catalog lacks has no `entry`: read and write its data points by ID.
[DESIGN.md](DESIGN.md#routes) says why the client routes this way.

### Discovery

`discoverDevices()` resolves with a `TuyaDiscovery` once it listens, and
`discovery.devices` holds the latest report from each device it heard, by
`deviceId`: its `host`, `version` and `productKey`.

| It | So |
| --- | --- |
| Hears the broadcast a device sends every few seconds, and asks each 3.5 device to answer every 6 s | Wait about 10 s before reading `discovery.devices`, or pass `onDevice` to hear each report as it comes |
| Listens on UDP ports 6666, 6667 and 7000, sharing each with other programs that listen there | It rejects with `DISCOVERY_FAILED` while a program holds one of them without sharing it |
| Hears only broadcasts on the machine's own subnets | It does not find a device on another subnet or VLAN: pass its `host` and `version` yourself |
| Hears nothing from a device that stops broadcasting while a client is connected, as some do | Start the discovery before you connect, and keep it open |

`await using` closes it at the end of its scope, or call `close()`.

## Naming data points

`@open-tuya/devices` holds over 1,700 devices converted from
[tuya-local](https://github.com/make-all/tuya-local), and the device files it
carries itself in `packages/devices/devices/`, in tuya-local's format, until
tuya-local lists them. Without `createTuyaClient`, find a device's entry, then
read and write its data points by name:

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
the rest from them, and a control that depends on another data point, such as
a thermostat's mode, reads it there. Such a write can set that data point
too, or throw a `TuyaError` with code `VALUE_UNAVAILABLE` while the device
holds it at a value the write cannot change. A value the data point cannot
hold, such as a mode the device lacks, throws a `TypeError`. A control's range, scale and
step can change with the device's state, such as a thermostat's in eco mode:
`resolveControl(entry, control, dataPoints)` gives them as they are now. A value is the device's own, in the unit its name carries. A name the
catalog gives alike across devices is in `CONTROL_NAMES`; any other is the
control's own, and its `kind` and `measures` say how to handle it. A
`category` marks a control outside the device's main function, a setting or
a diagnostic, and a sensor's `reading` says whether it reads the moment or a
running total. `entry.products` gives each product's `manufacturer`, `model` and
`modelId`, to name the device by.
`UNSUPPORTED.md` lists the devices not converted yet.

### A device the catalog does not list

Pass a cloud route and a `category` in `MODEL_CATEGORIES`, the sensors, to
`createTuyaClient`, which does the steps below itself. Outside it, build the entry from the codes of Tuya's standard
instruction set, which either cloud's model of the device gives each data
point:

```ts
import { createDeviceEntry } from "@open-tuya/devices";

const model = await account.readDeviceModel(device.deviceId);
const entry = createDeviceEntry(model, { category: device.category, name: device.name });
// { device: { motion: …, temperatureInC: …, batteryInPercent: … } }, or undefined
```

Match by product key first: a catalog entry names more of a device, such as a
plug's meter. Matching by data points alone can pick another kind of device
that reports the same ones, as a leak sensor and a motion sensor both report a
text on 1 and an integer on 4. The entry reads a temperature, a humidity and a
battery in any category, and a plug's, a strip's or a wall switch's outlets, a
motion, presence, door or leak sensor's detection only in its own category:
[DESIGN.md](DESIGN.md#device-models) lists the codes. Prefer it to the match by
data points only in a category of `MODEL_CATEGORIES`: elsewhere it holds the
readings and switches alone, as a heater's temperature without its power or a
plug's switch without its meter. Store the model with the device to build the
entry again without the cloud.

## Signing in to the Smart Life cloud

Pass Home Assistant's [client ID and schema](https://github.com/home-assistant/core/blob/82e1ed43f85b3254c51e7a8200ece159019743ab/homeassistant/components/tuya/const.py#L39-L40): they are the only
pair known to work, so `@open-tuya/cloud-app` signs in as Home Assistant does.

```ts
import { createAppCloudAccount, createQrLogin } from "@open-tuya/cloud-app";

const clientId = "HA_3y9q4ak7g4ephrvke";
const login = createQrLogin({
  clientId,
  schema: "haauthorize",
  userCode, // Smart Life app > Settings > Account and Security > User Code
});
const qrCode = await login.requestQrCode(); // show it as a QR code
const session = await login.waitForScan(qrCode);

const account = createAppCloudAccount({
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
| 28841004, "Your quota of Trial Edition is used up" | Upgrade the project's IoT Core plan from the trial |
| 28841101, 28841105, 28841106 | Authorize the API service the message names |
| 28841107, "your datacenter is suspended" | Remove the data center from the project, save, and add it again |
| 1106 to `listDevices()` | Pass `{ viaDeviceId }` with any device of the account |
| 2007, or no devices | Pick the data center the app account is in |

## Errors

Every package rejects with a `TuyaError`: branch on its `code`, and read the
error it stands for in `cause`. Your editor shows each code's full meaning on
`TuyaErrorCode`.

| `code` | Meaning |
| --- | --- |
| `CONNECTION_FAILED` | No connection to the device or the cloud opened: check the device's address and that it is on, or the route to the cloud |
| `CONNECTION_LOST` | The connection closed or stopped answering heartbeats, or the client or account was closed |
| `REQUEST_TIMED_OUT` | The device or the cloud did not answer in time. A write may still have been taken |
| `REQUEST_REJECTED` | The device or the cloud answered with an error, whose text the message carries |
| `DECRYPTION_FAILED`, `SESSION_KEY_NEGOTIATION_FAILED` | The local key or the protocol version is wrong |
| `MALFORMED_FRAME` | The device sent bytes that are not a frame: reconnect |
| `DISCOVERY_FAILED` | Another program holds a discovery port without sharing it |
| `QR_CODE_EXPIRED` | Request a new QR code |
| `SESSION_EXPIRED` | Sign in again by QR code. Two programs sharing one session end so |
| `RATE_LIMITED` | Wait before the next request |
| `PERMISSION_DENIED` | The developer platform refused for want of a plan or a permission: see the [table above](#signing-in-to-the-tuya-developer-platform) |
| `UNMAPPED_DATA_POINT` | The cloud cannot map the data point the write names, so nothing was sent |
| `ROUTES_FAILED` | Every route failed: `cause.errors` holds each route's error, in the order tried |
| `NO_CATALOG_ENTRY` | The catalog lacks the device: read and write its data points by ID |
| `VALUE_UNAVAILABLE` | The control cannot take the value while a data point the device sets itself, such as a mode, holds what it does now: wait for the device to change it |

A mistake in the call itself throws a `TypeError` instead, such as a value a
data point cannot hold, `readByWritingNull` on 3.4 or 3.5, or a gateway's
`createClient` on 3.1 or 3.2.

## Testing with simulators

Test your code against a simulated device instead of a real one: start one,
and point a LAN client at its port.

```ts
import { createLocalTuyaClient } from "@open-tuya/local";
import { startSimulatedDevice } from "@open-tuya/simulators";

const localKey = "0123456789abcdef";
await using device = await startSimulatedDevice({
  version: "3.4",
  localKey,
  dataPoints: { "1": true, "2": 21 },
});
await using client = createLocalTuyaClient({
  deviceId: device.deviceId,
  host: "127.0.0.1",
  port: device.port,
  version: "3.4",
  localKey,
});

await client.readDataPoints(); // { "1": true, "2": 21 }
device.report({ "2": 23 }); // the device changes on its own, and pushes it
device.received; // every frame the client sent, decrypted
```

A simulator listens on free ports of `127.0.0.1` and serves 3 clients at once,
as a device does.

| To | Do |
| --- | --- |
| Simulate a gateway | Pass `subDevices`, the data points of each device behind it by node ID, and add a node ID to `device.offline` to take that device offline |
| Make it refuse reads, as some 3.2 and 3.3 devices do | Set `device.refusesReads = true` |
| Make it only ack a write | Set `device.pushesAfterWrite = false` |
| Make it stop answering heartbeats | Set `device.answersHeartbeats = false` |
| Drop every connection | Call `device.disconnect()` |
| Have `discoverDevices()` hear it | Call `device.broadcast(port)` |

## Coverage and limitations

| Route | Covers | Limits |
| --- | --- | --- |
| LAN | Protocol 3.1 to 3.5, and the devices behind a 3.3, 3.4 or 3.5 gateway | Needs each device's local key, which only a cloud gives. On 3.1 a read succeeds under a wrong key |
| Tuya developer platform | Data centers `cn`, `us`, `us-e`, `eu`, `eu-w`, `in` and `sg` | Needs a cloud project, whose IoT Core trial expires and has to be extended |
| Smart Life cloud | A Smart Life account, signed in by QR code | Reads and writes only the data points the cloud passes through unchanged. One session serves one program |
| Catalog | Over 1,700 of tuya-local's devices, and the device files in `packages/devices/devices/` | A device neither lists has no entry, and `UNSUPPORTED.md` lists the tuya-local devices the import cannot convert |

[UNSUPPORTED.md](UNSUPPORTED.md) lists what no source pins down, and what the
code does until one does.

## Reporting a bug

Report every device that misbehaves: open-tuya is tested against simulators
and captured frames, and barely against real devices, so a report from yours
is how a bug gets found.

[Open an issue](https://github.com/cheziyi/open-tuya/issues/new) and include:

| Include | Where to find it |
| --- | --- |
| The route: LAN, Tuya developer platform or Smart Life cloud | Your `createTuyaClient` call |
| The device's `productKey` and protocol `version` | `discoverDevices()` or `account.listDevices()` |
| The package versions | `npm ls open-tuya` |
| The error's `code`, and its `cause` | The `TuyaError` thrown |
| What you called, what you expected, and what happened | Your code |
| The data points the device reports | `client.readDataPoints()` |

Leave out the local key and the cloud credentials: either lets anyone who
reads the issue reach your device or account.

## Development

Requires Node 22.12 or later and pnpm.

```sh
pnpm install
pnpm test
pnpm check
pnpm clone-reference   # clone or update every project under Credits into reference/
pnpm --filter @open-tuya/devices import-catalog ../../reference/make-all/tuya-local   # needs Node 22.18
```

`pnpm install` sets up a [lefthook](https://lefthook.dev) pre-commit hook that
runs `biome check --write` on staged files.

To release, add a changeset to each pull request with `pnpm changeset`. On
`main`, the release workflow opens a Version Packages pull request, and merging
it publishes each package whose version changed.
[AGENTS.md](AGENTS.md#version-each-package-with-semver) says which bump to
pick.

The Import catalog workflow runs the catalog import each day, and opens a pull
request when tuya-local's devices changed.

Both workflows open their pull requests as a GitHub App, which needs the
repository variable `PULL_REQUEST_APP_CLIENT_ID` and the secret
`PULL_REQUEST_APP_PRIVATE_KEY`. Give the App read and write access to
contents, pull requests and workflows, and install it on this repository
alone. It needs workflows access because each workflow resets its branch to
`main`, and GitHub refuses a push that changes a workflow file from a token
without it. [DESIGN.md](DESIGN.md#catalog) says why an App.

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
| [tuya/tuya-home-assistant](https://github.com/tuya/tuya-home-assistant) | MIT, Copyright (c) 2014-2021 Tuya Inc. | Issues capturing developer platform requests, responses and pushed device updates, by Tuya |
| [tuya/tuya-connector](https://github.com/tuya/tuya-connector) | Apache-2.0 | Developer platform API and its thing model, Java, by Tuya |
| [tuya/tuya-openclaw-skills](https://github.com/tuya/tuya-openclaw-skills) | MIT | The thing model and issuing its properties, documented by Tuya |
| [tuya/tuya-device-sharing-sdk](https://github.com/tuya/tuya-device-sharing-sdk) | MIT, Copyright (c) 2023 Tuya | Smart Life app QR login and its pushed device updates, by Tuya |
| [make-all/tuya-local](https://github.com/make-all/tuya-local) | MIT, Copyright 2018 Nik Rolls, 2026 Jason Rumney, 2022-2026 other contributors as listed in its ACKNOWLEDGEMENTS.md | Device catalog, Home Assistant; its local protocol is tinytuya's and its QR login tuya-device-sharing-sdk's |
| [azerty9971/xtend_tuya](https://github.com/azerty9971/xtend_tuya) | GPL-3.0 | Smart Life cloud responses, captured in its issues, Home Assistant |
| [home-assistant-libs/tuya-device-handlers](https://github.com/home-assistant-libs/tuya-device-handlers) | MIT | Smart Life cloud responses and pushed reports, captured in its issues, and how an integer's values read |
| [home-assistant/core `components/tuya`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/tuya) | Apache-2.0 | The Smart Life login's client ID and schema, cloud responses captured in its issues, what each standard code stands for by category, and temperature units, Home Assistant |
| [home-assistant/core `components/sensor`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/sensor) | Apache-2.0 | What a sensor's state class means, Home Assistant |
| [tuya/TuyaOpen `src/tuya_cloud_service`](https://github.com/tuya/TuyaOpen/tree/master/src/tuya_cloud_service) | Apache-2.0 | A device's own side of the LAN protocol: what it answers to each command, by Tuya |

Projects not under MIT contribute protocol facts only, never code:
[AGENTS.md](AGENTS.md#sources) says how. A project built on another, such as
tuya-local on tinytuya, does not agree with it independently.

## Legal disclaimer

An independent, community project for interoperability and home automation.
It is not affiliated with, authorized, or endorsed by Tuya Inc. or its
affiliates. Tuya, Smart Life and all other product names and trademarks are
the property of their respective owners; their use here is for identification
and compatibility only.

**Your own devices and accounts.** `@open-tuya/local` talks only to devices on
your LAN. The cloud packages contact Tuya's servers only with the credentials
you pass: your developer project's access ID and secret, or a session your own
Smart Life account approves by QR code. Follow the terms of service of your
Tuya account and developer project.

**No proprietary material.** The packages ship no Tuya credentials,
certificates, SDKs or binaries. The only keys in them are protocol constants
every device uses, as the projects under [Credits](#credits) publish them.
Each protocol fact comes from one of those projects, cited, or from
independent reverse engineering for interoperability.

**Writes change real devices.** A write reaches a device as its own app's
would: a heater turns on, a lock unlocks. Test against
[`@open-tuya/simulators`](#testing-with-simulators) first.

Provided "as is", without warranty of any kind (see [LICENSE](LICENSE)); use it
at your own risk.

## License

[MIT](LICENSE). Copyright © 2026 the open-tuya contributors.
