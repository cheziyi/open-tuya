# @open-tuya/cloud-developer

## 0.0.4

### Patch Changes

- [#40](https://github.com/cheziyi/open-tuya/pull/40) [`3bf52fc`](https://github.com/cheziyi/open-tuya/commit/3bf52fcc0b53e16f934f176a060b9f8460132b27) Thanks [@cheziyi](https://github.com/cheziyi)! - Show a README on the package's npm page, with an example and links to the full documentation.
- Updated dependencies [[`3bf52fc`](https://github.com/cheziyi/open-tuya/commit/3bf52fcc0b53e16f934f176a060b9f8460132b27)]:
  - @open-tuya/core@0.1.1

## 0.0.3

### Patch Changes

- [#17](https://github.com/cheziyi/open-tuya/pull/17) [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `DeveloperCloudTuyaClient.connected`, true until the client is closed.

- [#33](https://github.com/cheziyi/open-tuya/pull/33) [`7890c85`](https://github.com/cheziyi/open-tuya/commit/7890c850de8e5157006a907c10aa8ba4b947a93f) Thanks [@cheziyi](https://github.com/cheziyi)! - `writeDataPoints` issues `properties` as an object, as Tuya's own connector does, and `readDataPoints` leaves out a shadow property whose `dp_id` is null.

- [#33](https://github.com/cheziyi/open-tuya/pull/33) [`7890c85`](https://github.com/cheziyi/open-tuya/commit/7890c850de8e5157006a907c10aa8ba4b947a93f) Thanks [@cheziyi](https://github.com/cheziyi)! - A `DeveloperCloudTuyaClient` subscribes to pushes with its first `onDataPoints` listener and unsubscribes with its last, so a client that only reads and writes opens no MQTT connection.

- [#33](https://github.com/cheziyi/open-tuya/pull/33) [`7890c85`](https://github.com/cheziyi/open-tuya/commit/7890c850de8e5157006a907c10aa8ba4b947a93f) Thanks [@cheziyi](https://github.com/cheziyi)! - A cloud answer that lacks a field the account reads, or a device list that repeats a page, rejects with `REQUEST_REJECTED` instead of a `TypeError` or a loop that never ends.

- [#33](https://github.com/cheziyi/open-tuya/pull/33) [`7890c85`](https://github.com/cheziyi/open-tuya/commit/7890c850de8e5157006a907c10aa8ba4b947a93f) Thanks [@cheziyi](https://github.com/cheziyi)! - `listDevices()` takes the local keys the list of every linked account leaves out from the list of each such device's own account.

- [#33](https://github.com/cheziyi/open-tuya/pull/33) [`7890c85`](https://github.com/cheziyi/open-tuya/commit/7890c850de8e5157006a907c10aa8ba4b947a93f) Thanks [@cheziyi](https://github.com/cheziyi)! - A pushed report with no `protocol` field is handed on, and a subscription the broker refuses closes the MQTT connection, so the account connects again with fresh credentials.

- [#15](https://github.com/cheziyi/open-tuya/pull/15) [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc) Thanks [@cheziyi](https://github.com/cheziyi)! - Sign in with a cloud project's access ID and secret, list devices with their local keys, and read, write and receive pushed data points through `DeveloperCloudTuyaClient`.

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
