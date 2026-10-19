# @open-tuya/core

[![npm version](https://img.shields.io/npm/v/@open-tuya/core)](https://www.npmjs.com/package/@open-tuya/core)
[![CI](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cheziyi/open-tuya/actions/workflows/ci.yml?query=branch%3Amain)
[![License](https://img.shields.io/npm/l/@open-tuya/core)](LICENSE)

The types and errors every open-tuya package shares. Install
[`open-tuya`](https://www.npmjs.com/package/open-tuya) or one of its
packages instead: each depends on this one.

```ts
import { TuyaError } from "@open-tuya/core";

try {
  await client.writeDataPoints({ "1": false });
} catch (error) {
  if (error instanceof TuyaError && error.code === "REQUEST_TIMED_OUT") {
    // the device may still have taken the write
  }
}
```

[The open-tuya README](https://github.com/cheziyi/open-tuya#errors) says what each error code means.

## License

[MIT](LICENSE). Copyright © 2026 the open-tuya contributors.

Not affiliated with, authorized, or endorsed by Tuya Inc. Read the
[legal disclaimer](https://github.com/cheziyi/open-tuya#legal-disclaimer) before use.
