# @open-tuya/cloud-app

## 0.0.7

### Patch Changes

- [#64](https://github.com/cheziyi/open-tuya/pull/64) [`68ab1d2`](https://github.com/cheziyi/open-tuya/commit/68ab1d251d705460aaa77b220a7b4923cda2e292) Thanks [@cheziyi](https://github.com/cheziyi)! - A read through a cloud of a device the cloud last said was offline, in the account's device list or in a push, rejects with `DEVICE_OFFLINE`, where it answered with what the device last reported.
- Updated dependencies [[`68ab1d2`](https://github.com/cheziyi/open-tuya/commit/68ab1d251d705460aaa77b220a7b4923cda2e292)]:
  - @open-tuya/core@0.2.1

## 0.0.6

### Patch Changes

- [#62](https://github.com/cheziyi/open-tuya/pull/62) [`c4223c8`](https://github.com/cheziyi/open-tuya/commit/c4223c8801d1bab59e31fbef8495b8ae8b16744c) Thanks [@cheziyi](https://github.com/cheziyi)! - `readDeviceModel(deviceId)` on either cloud's account gives the standard code, type and values of each of a device's data points, and `createDeviceEntry(model, { category, name })` builds an entry from it for a device the catalog does not list; `createTuyaClient` does so itself when given a cloud route and the new `category` option, for a category in `MODEL_CATEGORIES`. `TuyaCloudAccount` gains `readDeviceModel`, so a class implementing it must add it, and `TuyaDeviceEntry.source` is optional, absent on an entry built from a model.
- Updated dependencies [[`c4223c8`](https://github.com/cheziyi/open-tuya/commit/c4223c8801d1bab59e31fbef8495b8ae8b16744c)]:
  - @open-tuya/core@0.2.0

## 0.0.5

### Patch Changes

- [#52](https://github.com/cheziyi/open-tuya/pull/52) [`b7ff47f`](https://github.com/cheziyi/open-tuya/commit/b7ff47fd85c84ec24a890d678b9d84b687d247f8) Thanks [@cheziyi](https://github.com/cheziyi)! - Read a custom-type answer of `"True"` in any letter case as Tuya's SDK does: such a device's data points were mapped as if it were not of a custom type.

## 0.0.4

### Patch Changes

- [#40](https://github.com/cheziyi/open-tuya/pull/40) [`3bf52fc`](https://github.com/cheziyi/open-tuya/commit/3bf52fcc0b53e16f934f176a060b9f8460132b27) Thanks [@cheziyi](https://github.com/cheziyi)! - Show a README on the package's npm page, with an example and links to the full documentation.
- Updated dependencies [[`3bf52fc`](https://github.com/cheziyi/open-tuya/commit/3bf52fcc0b53e16f934f176a060b9f8460132b27)]:
  - @open-tuya/core@0.1.1

## 0.0.3

### Patch Changes

- [#17](https://github.com/cheziyi/open-tuya/pull/17) [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `AppCloudTuyaClient.connected`, true until the client is closed.

- [#36](https://github.com/cheziyi/open-tuya/pull/36) [`e4673ea`](https://github.com/cheziyi/open-tuya/commit/e4673ea7625102b99fb89f78789ebee0dd794683) Thanks [@cheziyi](https://github.com/cheziyi)! - `AppCloudTuyaClient` subscribes to its device's pushes while it has a listener, so a client that only reads and writes opens no MQTT connection. `AppCloudAccount.createClient` rejects with `CONNECTION_LOST` when the account closes while it runs.

- [#14](https://github.com/cheziyi/open-tuya/pull/14) [`d7d5e08`](https://github.com/cheziyi/open-tuya/commit/d7d5e08edb24c7fcc482f829111a30c554ee45fc) Thanks [@cheziyi](https://github.com/cheziyi)! - Sign in by QR code as the Smart Life app does, list an account's devices with their local keys, and read, write and receive pushed data points through `AppCloudTuyaClient`.

- [#36](https://github.com/cheziyi/open-tuya/pull/36) [`e4673ea`](https://github.com/cheziyi/open-tuya/commit/e4673ea7625102b99fb89f78789ebee0dd794683) Thanks [@cheziyi](https://github.com/cheziyi)! - A success from the cloud whose result lacks a field the request needs rejects with a `TuyaError` with code `REQUEST_REJECTED`, not a `TypeError`, and a list the cloud answers as `""` or `null` reads as empty. A push that cannot be read is dropped, and a listener's throw is rethrown after the other listeners have the push, so neither reaches MQTT.js.

- [#15](https://github.com/cheziyi/open-tuya/pull/15) [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc) Thanks [@cheziyi](https://github.com/cheziyi)! - `AppCloudAccount` implements `TuyaCloudAccount` from core, and pushes now arrive through MQTT.js.

- [#36](https://github.com/cheziyi/open-tuya/pull/36) [`e4673ea`](https://github.com/cheziyi/open-tuya/commit/e4673ea7625102b99fb89f78789ebee0dd794683) Thanks [@cheziyi](https://github.com/cheziyi)! - `AppCloudAccount` sends a GET the cloud refuses with 1108 "uri path invalid" twice more, 500 ms apart, as the cloud refuses about one request in 20 at random with it.

- [#36](https://github.com/cheziyi/open-tuya/pull/36) [`e4673ea`](https://github.com/cheziyi/open-tuya/commit/e4673ea7625102b99fb89f78789ebee0dd794683) Thanks [@cheziyi](https://github.com/cheziyi)! - `QrLogin.waitForScan` polls on through a poll that times out, cannot connect or is rate limited, rather than rejecting.

- [#36](https://github.com/cheziyi/open-tuya/pull/36) [`e4673ea`](https://github.com/cheziyi/open-tuya/commit/e4673ea7625102b99fb89f78789ebee0dd794683) Thanks [@cheziyi](https://github.com/cheziyi)! - `AppCloudTuyaClient.readDataPoints` finds each data point under the code its relation's `statusFormat` names, so it reads a data point whose status code differs from its command code, such as `energy_reset` for `clear_energy`.

- [#24](https://github.com/cheziyi/open-tuya/pull/24) [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19) Thanks [@cheziyi](https://github.com/cheziyi)! - Support Node 22.12 and later, down from 22.19.
- Updated dependencies [[`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f), [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc), [`d7d5e08`](https://github.com/cheziyi/open-tuya/commit/d7d5e08edb24c7fcc482f829111a30c554ee45fc), [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`bd7645b`](https://github.com/cheziyi/open-tuya/commit/bd7645b7e3406b714b3ba34ce475f8f928370b1d), [`2a126e7`](https://github.com/cheziyi/open-tuya/commit/2a126e73fbc0b8321258bed22b2cf5990a90d4ad), [`8e02172`](https://github.com/cheziyi/open-tuya/commit/8e02172f68bd03347ca25639f1fa19537314fcfd), [`383dfbc`](https://github.com/cheziyi/open-tuya/commit/383dfbcf89920c02fbb81da30b7eece66bb245f7), [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19)]:
  - @open-tuya/core@0.1.0

## 0.0.2

### Patch Changes

- Updated dependencies [[`c1443d9`](https://github.com/cheziyi/open-tuya/commit/c1443d993e6178e6d03bc4bcc607fe5f264089f9), [`050676f`](https://github.com/cheziyi/open-tuya/commit/050676f6bb225c21e02ca4a0ccbe0923a18d0795), [`75d11fb`](https://github.com/cheziyi/open-tuya/commit/75d11fb6afcf79cff49b00b9b865c67456da3c1c), [`33b888e`](https://github.com/cheziyi/open-tuya/commit/33b888e8d65c74b2764c70ac71196fbbe0f3d77e)]:
  - @open-tuya/core@0.0.2

## 0.0.1

### Patch Changes

- [`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f) Thanks [@cheziyi](https://github.com/cheziyi)! - Publish an empty package from the release workflow, to set up trusted publishing. It exports nothing yet.
- Updated dependencies [[`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f)]:
  - @open-tuya/core@0.0.1
