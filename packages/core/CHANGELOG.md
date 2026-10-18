# @open-tuya/core

## 0.1.0

### Minor Changes

- [#11](https://github.com/cheziyi/open-tuya/pull/11) [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873) Thanks [@cheziyi](https://github.com/cheziyi)! - `TuyaClient.close()` now returns a promise that resolves once the client's connections are released, and `TuyaClient` extends `AsyncDisposable`, so `await using` closes a client.

- [#17](https://github.com/cheziyi/open-tuya/pull/17) [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f) Thanks [@cheziyi](https://github.com/cheziyi)! - `TuyaClient` now has `connected`, which a class implementing it has to add; add the `ROUTES_FAILED` and `NO_CATALOG_ENTRY` error codes.

- [#28](https://github.com/cheziyi/open-tuya/pull/28) [`2a126e7`](https://github.com/cheziyi/open-tuya/commit/2a126e73fbc0b8321258bed22b2cf5990a90d4ad) Thanks [@cheziyi](https://github.com/cheziyi)! - `ProtocolVersion` takes `"3.1"`, so a `switch` over it that names every version needs a case for it.

- [#29](https://github.com/cheziyi/open-tuya/pull/29) [`8e02172`](https://github.com/cheziyi/open-tuya/commit/8e02172f68bd03347ca25639f1fa19537314fcfd) Thanks [@cheziyi](https://github.com/cheziyi)! - `ProtocolVersion` takes `"3.2"`, so a `switch` over it that names every version needs a case for it.

### Patch Changes

- [#15](https://github.com/cheziyi/open-tuya/pull/15) [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `TuyaCloudAccount` and `TuyaCloudDevice`, which both clouds implement; `MqttSession` and `fetchJson`, which both clouds use; `isDataPointValue`; and the `PERMISSION_DENIED` error code.

- [#14](https://github.com/cheziyi/open-tuya/pull/14) [`d7d5e08`](https://github.com/cheziyi/open-tuya/commit/d7d5e08edb24c7fcc482f829111a30c554ee45fc) Thanks [@cheziyi](https://github.com/cheziyi)! - Add the `QR_CODE_EXPIRED`, `SESSION_EXPIRED`, `RATE_LIMITED` and `UNMAPPED_DATA_POINT` error codes, for the cloud.

- [#11](https://github.com/cheziyi/open-tuya/pull/11) [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873) Thanks [@cheziyi](https://github.com/cheziyi)! - Add the `DISCOVERY_FAILED` error code, for a UDP port that discovery cannot bind.

- [#32](https://github.com/cheziyi/open-tuya/pull/32) [`bd7645b`](https://github.com/cheziyi/open-tuya/commit/bd7645b7e3406b714b3ba34ce475f8f928370b1d) Thanks [@cheziyi](https://github.com/cheziyi)! - `MqttSession` keeps doubling its wait after each connection the broker drops before its renewal, renews credentials no sooner than 60 s and no later than about 24.8 days after connecting, connects nothing once closed, and resolves `close()` only once every connection it opened is released.

- [#19](https://github.com/cheziyi/open-tuya/pull/19) [`383dfbc`](https://github.com/cheziyi/open-tuya/commit/383dfbcf89920c02fbb81da30b7eece66bb245f7) Thanks [@cheziyi](https://github.com/cheziyi)! - Add the `VALUE_UNAVAILABLE` error code, for a value a control cannot take while the device holds another data point where it is.

- [#24](https://github.com/cheziyi/open-tuya/pull/24) [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19) Thanks [@cheziyi](https://github.com/cheziyi)! - Support Node 22.12 and later, down from 22.19.

## 0.0.2

### Patch Changes

- [#8](https://github.com/cheziyi/open-tuya/pull/8) [`c1443d9`](https://github.com/cheziyi/open-tuya/commit/c1443d993e6178e6d03bc4bcc607fe5f264089f9) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `ProtocolVersion` and `PROTOCOL_VERSIONS`, and the `CONNECTION_FAILED` and `CONNECTION_LOST` error codes.

- [#4](https://github.com/cheziyi/open-tuya/pull/4) [`050676f`](https://github.com/cheziyi/open-tuya/commit/050676f6bb225c21e02ca4a0ccbe0923a18d0795) Thanks [@cheziyi](https://github.com/cheziyi)! - Add the `SESSION_KEY_NEGOTIATION_FAILED` code, and use `DECRYPTION_FAILED` for a frame whose HMAC or tag is wrong as well.

- [#9](https://github.com/cheziyi/open-tuya/pull/9) [`75d11fb`](https://github.com/cheziyi/open-tuya/commit/75d11fb6afcf79cff49b00b9b865c67456da3c1c) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `TuyaClient`, the data point types `DataPointId`, `DataPointValue` and `DataPoints`, and the `REQUEST_REJECTED` and `REQUEST_TIMED_OUT` error codes.

- [#2](https://github.com/cheziyi/open-tuya/pull/2) [`33b888e`](https://github.com/cheziyi/open-tuya/commit/33b888e8d65c74b2764c70ac71196fbbe0f3d77e) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `TuyaError`, which every open-tuya package throws, with a `code` for each failure: `MALFORMED_FRAME` and `DECRYPTION_FAILED`.

## 0.0.1

### Patch Changes

- [`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f) Thanks [@cheziyi](https://github.com/cheziyi)! - Publish an empty package from the release workflow, to set up trusted publishing. It exports nothing yet.
