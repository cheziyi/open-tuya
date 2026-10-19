# @open-tuya/simulators

[![npm version](https://img.shields.io/npm/v/@open-tuya/simulators)](https://www.npmjs.com/package/@open-tuya/simulators)
[![CI](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml?query=branch%3Amain)
[![License](https://img.shields.io/npm/l/@open-tuya/simulators)](LICENSE)

Test code that controls Tuya devices against a simulated device: a LAN server
that answers protocol 3.1 to 3.5 as a device does, including a gateway and
the devices behind it.

```sh
npm install --save-dev @open-tuya/simulators
```

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
```

[The open-tuya README](https://github.com/cheziyi/open-tuya#testing-with-simulators) lists what a test can set
on the device.

## License

[MIT](LICENSE). Copyright © 2026 the open-tuya contributors.

Not affiliated with, authorized, or endorsed by Tuya Inc. Read the
[legal disclaimer](https://github.com/cheziyi/open-tuya#legal-disclaimer) before use.
