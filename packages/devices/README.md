# @open-tuya/devices

[![npm version](https://img.shields.io/npm/v/@open-tuya/devices)](https://www.npmjs.com/package/@open-tuya/devices)
[![CI](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml?query=branch%3Amain)
[![License](https://img.shields.io/npm/l/@open-tuya/devices)](LICENSE)

Look up what each data point of a Tuya device controls, from a catalog of
1,769 devices converted from [tuya-local](https://github.com/make-all/tuya-local),
and read and write the device by those names.

```sh
npm install @open-tuya/devices
```

```ts
import { findDeviceEntries, readControls, writeControls } from "@open-tuya/devices";

const dataPoints = await client.readDataPoints();
const [entry] = findDeviceEntries({ productKey, dataPoints });
readControls(entry, dataPoints);
// { device: { on: true, voltageInV: 230.5, powerInW: 12.3, timerInSeconds: 0 } }
await client.writeDataPoints(writeControls(entry, { device: { on: false } }, dataPoints));
```

[The open-tuya README](https://github.com/cheziyi/open-tuya#naming-data-points) says how a control is named
and what a write can throw. A device the catalog lacks goes to tuya-local
first: the catalog is imported from it each day.

## License

[MIT](LICENSE). Copyright © 2026 the open-tuya contributors.

Not affiliated with, authorized, or endorsed by Tuya Inc. Read the
[legal disclaimer](https://github.com/cheziyi/open-tuya#legal-disclaimer) before use.
