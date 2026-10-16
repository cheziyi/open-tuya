# @open-tuya/core

## 0.0.2

### Patch Changes

- [#8](https://github.com/cheziyi/open-tuya/pull/8) [`c1443d9`](https://github.com/cheziyi/open-tuya/commit/c1443d993e6178e6d03bc4bcc607fe5f264089f9) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `ProtocolVersion` and `PROTOCOL_VERSIONS`, and the `CONNECTION_FAILED` and `CONNECTION_LOST` error codes.

- [#4](https://github.com/cheziyi/open-tuya/pull/4) [`050676f`](https://github.com/cheziyi/open-tuya/commit/050676f6bb225c21e02ca4a0ccbe0923a18d0795) Thanks [@cheziyi](https://github.com/cheziyi)! - Add the `SESSION_KEY_NEGOTIATION_FAILED` code, and use `DECRYPTION_FAILED` for a frame whose HMAC or tag is wrong as well.

- [#9](https://github.com/cheziyi/open-tuya/pull/9) [`75d11fb`](https://github.com/cheziyi/open-tuya/commit/75d11fb6afcf79cff49b00b9b865c67456da3c1c) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `TuyaClient`, the data point types `DataPointId`, `DataPointValue` and `DataPoints`, and the `REQUEST_REJECTED` and `REQUEST_TIMED_OUT` error codes.

- [#2](https://github.com/cheziyi/open-tuya/pull/2) [`33b888e`](https://github.com/cheziyi/open-tuya/commit/33b888e8d65c74b2764c70ac71196fbbe0f3d77e) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `TuyaError`, which every open-tuya package throws, with a `code` for each failure: `MALFORMED_FRAME` and `DECRYPTION_FAILED`.

## 0.0.1

### Patch Changes

- [`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f) Thanks [@cheziyi](https://github.com/cheziyi)! - Publish an empty package from the release workflow, to set up trusted publishing. It exports nothing yet.
