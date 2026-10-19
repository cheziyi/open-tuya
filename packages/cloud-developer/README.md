# @open-tuya/cloud-developer

[![npm version](https://img.shields.io/npm/v/@open-tuya/cloud-developer)](https://www.npmjs.com/package/@open-tuya/cloud-developer)
[![CI](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml?query=branch%3Amain)
[![License](https://img.shields.io/npm/l/@open-tuya/cloud-developer)](LICENSE)

Reach the Tuya developer platform API, signed in with a cloud project's access
ID and secret: list devices with their local keys, read and write their data
points, and hear their changes pushed.

```sh
npm install @open-tuya/cloud-developer
```

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

[The open-tuya README](https://github.com/cheziyi/open-tuya#signing-in-to-the-tuya-developer-platform) says how
to set up the project, and how to fix each `PERMISSION_DENIED` the platform
answers.

## License

[MIT](LICENSE). Copyright © 2026 the open-tuya contributors.

Not affiliated with, authorized, or endorsed by Tuya Inc. Read the
[legal disclaimer](https://github.com/cheziyi/open-tuya#legal-disclaimer) before use.
