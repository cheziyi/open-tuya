# @open-tuya/cloud-app

[![npm version](https://img.shields.io/npm/v/@open-tuya/cloud-app)](https://www.npmjs.com/package/@open-tuya/cloud-app)
[![npm downloads](https://img.shields.io/npm/dm/@open-tuya/cloud-app)](https://www.npmjs.com/package/@open-tuya/cloud-app)
[![CI](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml?query=branch%3Amain)
[![Node version](https://img.shields.io/node/v/@open-tuya/cloud-app)](package.json)
[![Types](https://img.shields.io/badge/types-TypeScript-blue)](package.json)
[![License](https://img.shields.io/npm/l/@open-tuya/cloud-app)](LICENSE)

Reach the Tuya cloud as the Smart Life app does, signed in by scanning a QR
code with the app: list devices with their local keys, read and write their
data points, and hear their changes pushed.

```sh
npm install @open-tuya/cloud-app
```

```ts
import { createAppCloudAccount, createQrLogin } from "@open-tuya/cloud-app";

const clientId = "HA_3y9q4ak7g4ephrvke";
const login = createQrLogin({ clientId, schema: "haauthorize", userCode });
const qrCode = await login.requestQrCode(); // show it as a QR code
const session = await login.waitForScan(qrCode);

const account = createAppCloudAccount({ clientId, session, onSessionChange: save });
const devices = await account.listDevices(); // deviceId, localKey, productKey
await using client = await account.createClient(devices[0].deviceId);
```

[The open-tuya README](https://github.com/cheziyi/open-tuya#signing-in-to-the-smart-life-cloud) says where the
user code is, why the client ID is Home Assistant's, and which data points
the cloud passes through.

## License

[MIT](LICENSE). Copyright © 2026 the open-tuya contributors.

Not affiliated with, authorized, or endorsed by Tuya Inc. Read the
[legal disclaimer](https://github.com/cheziyi/open-tuya#legal-disclaimer) before use.
