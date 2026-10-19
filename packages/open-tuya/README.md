# open-tuya

[![npm version](https://img.shields.io/npm/v/open-tuya)](https://www.npmjs.com/package/open-tuya)
[![npm downloads](https://img.shields.io/npm/dm/open-tuya)](https://www.npmjs.com/package/open-tuya)
[![CI](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml?query=branch%3Amain)
[![Catalog import](https://img.shields.io/github/actions/workflow/status/cheziyi/open-tuya/import-catalog.yml?branch=main&label=catalog%20import)](https://github.com/cheziyi/open-tuya/actions/workflows/import-catalog.yml)
[![Node version](https://img.shields.io/node/v/open-tuya)](package.json)
[![Types](https://img.shields.io/badge/types-TypeScript-blue)](package.json)
[![LAN protocol](https://img.shields.io/badge/LAN_protocol-3.1_to_3.5-blue)](https://github.com/cheziyi/open-tuya#reaching-a-device)
[![License](https://img.shields.io/npm/l/open-tuya)](LICENSE)
[![Socket](https://socket.dev/api/badge/npm/package/open-tuya)](https://socket.dev/npm/package/open-tuya)

Control Tuya devices three ways from Node.js and TypeScript: over the local
network (LAN), through the Tuya developer platform, and through the cloud the
Smart Life app signs in to. `createTuyaClient` tries the routes in the order
you give, and names each data point from a catalog of 1,769 devices. It
re-exports every `@open-tuya` package but the simulators.

```sh
npm install open-tuya
```

```ts
import { createTuyaClient, discoverDevices } from "open-tuya";

await using discovery = await discoverDevices();
const [device] = await account.listDevices(); // either cloud's account
const lan = discovery.devices.get(device.deviceId);

await using client = await createTuyaClient({
  deviceId: device.deviceId,
  productKey: device.productKey,
  routes: [
    ...(lan && device.localKey
      ? [{ lan: { host: lan.host, version: lan.version, localKey: device.localKey, discovery } }]
      : []),
    { cloud: account },
  ],
});
await client.readControls(); // { device: { on: true, … } }
await client.writeControls({ device: { on: false } });
```

[The open-tuya README](https://github.com/cheziyi/open-tuya#reaching-a-device) says how each route is tried,
how to sign in to either cloud, and what each error means.

## License

[MIT](LICENSE). Copyright © 2026 the open-tuya contributors.

Not affiliated with, authorized, or endorsed by Tuya Inc. Read the
[legal disclaimer](https://github.com/cheziyi/open-tuya#legal-disclaimer) before use.
