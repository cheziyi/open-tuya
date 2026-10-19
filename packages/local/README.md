# @open-tuya/local

[![npm version](https://img.shields.io/npm/v/@open-tuya/local)](https://www.npmjs.com/package/@open-tuya/local)
[![npm downloads](https://img.shields.io/npm/dm/@open-tuya/local)](https://www.npmjs.com/package/@open-tuya/local)
[![CI](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml?query=branch%3Amain)
[![Node version](https://img.shields.io/node/v/@open-tuya/local)](package.json)
[![Types](https://img.shields.io/badge/types-TypeScript-blue)](package.json)
[![LAN protocol](https://img.shields.io/badge/LAN_protocol-3.1_to_3.5-blue)](https://github.com/cheziyi/open-tuya#reaching-a-device)
[![License](https://img.shields.io/npm/l/@open-tuya/local)](LICENSE)
[![Socket](https://socket.dev/api/badge/npm/package/@open-tuya/local)](https://socket.dev/npm/package/@open-tuya/local)

Discover Tuya devices on the LAN, and read and write their data points with
no cloud, on protocol 3.1 to 3.5, including the devices behind a gateway.

```sh
npm install @open-tuya/local
```

```ts
import { createLocalTuyaClient, discoverDevices } from "@open-tuya/local";

await using discovery = await discoverDevices();
// …wait for the device's broadcast, every few seconds
const found = discovery.devices.get(deviceId);

await using client = createLocalTuyaClient({
  deviceId,
  host: found.host,
  version: found.version,
  localKey, // from @open-tuya/cloud-app or @open-tuya/cloud-developer
  discovery,
});
await client.readDataPoints(); // { "1": true, "2": 21 }
await client.writeDataPoints({ "1": false });
client.onDataPoints((dataPoints) => update(dataPoints));
```

[The open-tuya README](https://github.com/cheziyi/open-tuya#discovery) says what discovery hears, how the
client follows a device to a new address, and how to reach a device behind a
gateway or one that refuses a read.

## License

[MIT](LICENSE). Copyright © 2026 the open-tuya contributors.

Not affiliated with, authorized, or endorsed by Tuya Inc. Read the
[legal disclaimer](https://github.com/cheziyi/open-tuya#legal-disclaimer) before use.
