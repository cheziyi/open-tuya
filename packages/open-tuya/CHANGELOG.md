# open-tuya

## 0.0.3

### Patch Changes

- [#24](https://github.com/cheziyi/open-tuya/pull/24) [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19) Thanks [@cheziyi](https://github.com/cheziyi)! - Support Node 22.12 and later, down from 22.19.

- [#17](https://github.com/cheziyi/open-tuya/pull/17) [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `createTuyaClient`, which reaches a device over the LAN and either cloud in the order you give, falls back to the next route when one fails, and reads and writes its controls by name from the device catalog; re-export every package but `@open-tuya/simulators`.

- [#19](https://github.com/cheziyi/open-tuya/pull/19) [`383dfbc`](https://github.com/cheziyi/open-tuya/commit/383dfbcf89920c02fbb81da30b7eece66bb245f7) Thanks [@cheziyi](https://github.com/cheziyi)! - `RoutedTuyaClient.onControls` reports a control again when a data point it depends on changes, and `writeControls` reads the device first when it does not know such a data point yet.

- [#26](https://github.com/cheziyi/open-tuya/pull/26) [`69ac578`](https://github.com/cheziyi/open-tuya/commit/69ac578ca62b48b0fc26d7ef743c4c3d283eba02) Thanks [@cheziyi](https://github.com/cheziyi)! - The LAN route takes `discovery`, to follow the device to a new address, as `createLocalTuyaClient` does.

- [#23](https://github.com/cheziyi/open-tuya/pull/23) [`fc8643e`](https://github.com/cheziyi/open-tuya/commit/fc8643e4ffa3e0852a0e146660596070d76b0b11) Thanks [@cheziyi](https://github.com/cheziyi)! - `createTuyaClient` takes a route through a gateway, `{ gateway, nodeId }`, for a device behind a gateway on the LAN.

- [#18](https://github.com/cheziyi/open-tuya/pull/18) [`441eefa`](https://github.com/cheziyi/open-tuya/commit/441eefa5fe0d5f30d70dece609d3b463afa5b0ed) Thanks [@cheziyi](https://github.com/cheziyi)! - `RoutedTuyaClient.writeControls` keeps the other bits of a masked control's data point from what the device last reported, reading it first when it has not, and runs one write at a time.

- [#28](https://github.com/cheziyi/open-tuya/pull/28) [`2a126e7`](https://github.com/cheziyi/open-tuya/commit/2a126e73fbc0b8321258bed22b2cf5990a90d4ad) Thanks [@cheziyi](https://github.com/cheziyi)! - The LAN route reaches a device of protocol 3.1.

- [#29](https://github.com/cheziyi/open-tuya/pull/29) [`8e02172`](https://github.com/cheziyi/open-tuya/commit/8e02172f68bd03347ca25639f1fa19537314fcfd) Thanks [@cheziyi](https://github.com/cheziyi)! - The LAN route reaches a device of protocol 3.2, and takes `readByWritingNull` for a device that refuses a read.

- [#20](https://github.com/cheziyi/open-tuya/pull/20) [`bf1e86e`](https://github.com/cheziyi/open-tuya/commit/bf1e86e6e0b5f9302e4bf75183b3fd3e116e5e85) Thanks [@cheziyi](https://github.com/cheziyi)! - `RoutedTuyaClient.onControls` reports a control when a data point it reads instead of its own changes.

- [#32](https://github.com/cheziyi/open-tuya/pull/32) [`bd7645b`](https://github.com/cheziyi/open-tuya/commit/bd7645b7e3406b714b3ba34ce475f8f928370b1d) Thanks [@cheziyi](https://github.com/cheziyi)! - `createTuyaClient` reads the device to find its catalog entry over a LAN route listed first, waiting for it to connect, rather than skipping it for the cloud, and closes the routes it built when a later route throws while being built.
- Updated dependencies [[`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f), [`e4673ea`](https://github.com/cheziyi/open-tuya/commit/e4673ea7625102b99fb89f78789ebee0dd794683), [`d7d5e08`](https://github.com/cheziyi/open-tuya/commit/d7d5e08edb24c7fcc482f829111a30c554ee45fc), [`e4673ea`](https://github.com/cheziyi/open-tuya/commit/e4673ea7625102b99fb89f78789ebee0dd794683), [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc), [`e4673ea`](https://github.com/cheziyi/open-tuya/commit/e4673ea7625102b99fb89f78789ebee0dd794683), [`e4673ea`](https://github.com/cheziyi/open-tuya/commit/e4673ea7625102b99fb89f78789ebee0dd794683), [`e4673ea`](https://github.com/cheziyi/open-tuya/commit/e4673ea7625102b99fb89f78789ebee0dd794683), [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f), [`7890c85`](https://github.com/cheziyi/open-tuya/commit/7890c850de8e5157006a907c10aa8ba4b947a93f), [`7890c85`](https://github.com/cheziyi/open-tuya/commit/7890c850de8e5157006a907c10aa8ba4b947a93f), [`7890c85`](https://github.com/cheziyi/open-tuya/commit/7890c850de8e5157006a907c10aa8ba4b947a93f), [`7890c85`](https://github.com/cheziyi/open-tuya/commit/7890c850de8e5157006a907c10aa8ba4b947a93f), [`7890c85`](https://github.com/cheziyi/open-tuya/commit/7890c850de8e5157006a907c10aa8ba4b947a93f), [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc), [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f), [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc), [`d7d5e08`](https://github.com/cheziyi/open-tuya/commit/d7d5e08edb24c7fcc482f829111a30c554ee45fc), [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`bd7645b`](https://github.com/cheziyi/open-tuya/commit/bd7645b7e3406b714b3ba34ce475f8f928370b1d), [`2a126e7`](https://github.com/cheziyi/open-tuya/commit/2a126e73fbc0b8321258bed22b2cf5990a90d4ad), [`8e02172`](https://github.com/cheziyi/open-tuya/commit/8e02172f68bd03347ca25639f1fa19537314fcfd), [`383dfbc`](https://github.com/cheziyi/open-tuya/commit/383dfbcf89920c02fbb81da30b7eece66bb245f7), [`0d3107b`](https://github.com/cheziyi/open-tuya/commit/0d3107b2be3c0fff45d85378aaacd4df0c2ce8e8), [`41f1a7d`](https://github.com/cheziyi/open-tuya/commit/41f1a7de13050f4cba81f66c1dd6fa8a1e33bac3), [`b745b95`](https://github.com/cheziyi/open-tuya/commit/b745b956689b5bbc05391f7dfd27ed0096696e3f), [`383dfbc`](https://github.com/cheziyi/open-tuya/commit/383dfbcf89920c02fbb81da30b7eece66bb245f7), [`2cd00eb`](https://github.com/cheziyi/open-tuya/commit/2cd00eb8b5690b444f12b43a2732163ef7a97dbd), [`c9ea055`](https://github.com/cheziyi/open-tuya/commit/c9ea055ab6d228e5190e36f1ece6f3b711073efe), [`667e37f`](https://github.com/cheziyi/open-tuya/commit/667e37f1710c1ee4650b71ee158912fdfbf441e1), [`e24dcbe`](https://github.com/cheziyi/open-tuya/commit/e24dcbe73c99c4eefd65605f1d0f8ace2c9ab77c), [`c600a3f`](https://github.com/cheziyi/open-tuya/commit/c600a3fe9ba1310b2dc0b246eec8ec0d6b5b0233), [`441eefa`](https://github.com/cheziyi/open-tuya/commit/441eefa5fe0d5f30d70dece609d3b463afa5b0ed), [`bf1e86e`](https://github.com/cheziyi/open-tuya/commit/bf1e86e6e0b5f9302e4bf75183b3fd3e116e5e85), [`8057a9d`](https://github.com/cheziyi/open-tuya/commit/8057a9d7afbe4b03791d8e8c3f8ca24bd417f6fd), [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`5f2e1f8`](https://github.com/cheziyi/open-tuya/commit/5f2e1f8c065db03013cafdd647e8f0fcd40a6d48), [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f), [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`69ac578`](https://github.com/cheziyi/open-tuya/commit/69ac578ca62b48b0fc26d7ef743c4c3d283eba02), [`fc8643e`](https://github.com/cheziyi/open-tuya/commit/fc8643e4ffa3e0852a0e146660596070d76b0b11), [`2a126e7`](https://github.com/cheziyi/open-tuya/commit/2a126e73fbc0b8321258bed22b2cf5990a90d4ad), [`8e02172`](https://github.com/cheziyi/open-tuya/commit/8e02172f68bd03347ca25639f1fa19537314fcfd), [`41f1a7d`](https://github.com/cheziyi/open-tuya/commit/41f1a7de13050f4cba81f66c1dd6fa8a1e33bac3), [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19)]:
  - @open-tuya/cloud-app@0.0.3
  - @open-tuya/cloud-developer@0.0.3
  - @open-tuya/core@0.1.0
  - @open-tuya/devices@0.0.3
  - @open-tuya/local@0.2.0

## 0.0.2

### Patch Changes

- [#6](https://github.com/cheziyi/open-tuya/pull/6) [`fb31159`](https://github.com/cheziyi/open-tuya/commit/fb311599138de62fa302c081c552ef21579c553a) Thanks [@cheziyi](https://github.com/cheziyi)! - Describe the package as controlling Tuya devices over the LAN, the Tuya developer platform and the Smart Life app's cloud alike, rather than over the LAN with the cloud as a fallback.
- Updated dependencies [[`c1443d9`](https://github.com/cheziyi/open-tuya/commit/c1443d993e6178e6d03bc4bcc607fe5f264089f9), [`050676f`](https://github.com/cheziyi/open-tuya/commit/050676f6bb225c21e02ca4a0ccbe0923a18d0795), [`75d11fb`](https://github.com/cheziyi/open-tuya/commit/75d11fb6afcf79cff49b00b9b865c67456da3c1c), [`33b888e`](https://github.com/cheziyi/open-tuya/commit/33b888e8d65c74b2764c70ac71196fbbe0f3d77e), [`75d11fb`](https://github.com/cheziyi/open-tuya/commit/75d11fb6afcf79cff49b00b9b865c67456da3c1c), [`c1443d9`](https://github.com/cheziyi/open-tuya/commit/c1443d993e6178e6d03bc4bcc607fe5f264089f9), [`33b888e`](https://github.com/cheziyi/open-tuya/commit/33b888e8d65c74b2764c70ac71196fbbe0f3d77e), [`050676f`](https://github.com/cheziyi/open-tuya/commit/050676f6bb225c21e02ca4a0ccbe0923a18d0795), [`0136431`](https://github.com/cheziyi/open-tuya/commit/0136431fb7544e0db14a9c9d0534194ac3c9102d)]:
  - @open-tuya/core@0.0.2
  - @open-tuya/local@0.1.0
  - @open-tuya/cloud-app@0.0.2
  - @open-tuya/cloud-developer@0.0.2
  - @open-tuya/devices@0.0.2

## 0.0.1

### Patch Changes

- [`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f) Thanks [@cheziyi](https://github.com/cheziyi)! - Publish an empty package from the release workflow, to set up trusted publishing. It exports nothing yet.
- Updated dependencies [[`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f)]:
  - @open-tuya/core@0.0.1
  - @open-tuya/local@0.0.1
  - @open-tuya/cloud-developer@0.0.1
  - @open-tuya/cloud-app@0.0.1
  - @open-tuya/devices@0.0.1
