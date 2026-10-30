# @open-tuya/simulators

## 0.0.6

### Patch Changes

- Updated dependencies [[`c4223c8`](https://github.com/cheziyi/open-tuya/commit/c4223c8801d1bab59e31fbef8495b8ae8b16744c)]:
  - @open-tuya/core@0.2.0

## 0.0.5

### Patch Changes

- [#52](https://github.com/cheziyi/open-tuya/pull/52) [`b7ff47f`](https://github.com/cheziyi/open-tuya/commit/b7ff47fd85c84ec24a890d678b9d84b687d247f8) Thanks [@cheziyi](https://github.com/cheziyi)! - A simulated 3.3 or 3.4 device sends an empty payload, as a write ack's or a heartbeat reply's, as no bytes, as a device does, rather than as one padded block.

## 0.0.4

### Patch Changes

- [#40](https://github.com/cheziyi/open-tuya/pull/40) [`3bf52fc`](https://github.com/cheziyi/open-tuya/commit/3bf52fcc0b53e16f934f176a060b9f8460132b27) Thanks [@cheziyi](https://github.com/cheziyi)! - Show a README on the package's npm page, with an example and links to the full documentation.
- Updated dependencies [[`3bf52fc`](https://github.com/cheziyi/open-tuya/commit/3bf52fcc0b53e16f934f176a060b9f8460132b27)]:
  - @open-tuya/core@0.1.1

## 0.0.3

### Patch Changes

- [#24](https://github.com/cheziyi/open-tuya/pull/24) [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19) Thanks [@cheziyi](https://github.com/cheziyi)! - Support Node 22.12 and later, down from 22.19.

- [#11](https://github.com/cheziyi/open-tuya/pull/11) [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873) Thanks [@cheziyi](https://github.com/cheziyi)! - A simulated device closes at the end of an `await using` scope, and closing it twice is safe.

- [#35](https://github.com/cheziyi/open-tuya/pull/35) [`5f2e1f8`](https://github.com/cheziyi/open-tuya/commit/5f2e1f8c065db03013cafdd647e8f0fcd40a6d48) Thanks [@cheziyi](https://github.com/cheziyi)! - `SimulatedTuyaDevice` serves 3 clients at once and closes a fourth's connection, closes a connection idle for 30 s, closes a 3.5 connection on a sequence number not above the last, answers a 3.5 query with `devId` and a 3.3 gateway's online query, and throws a `TuyaError` or a `TypeError` where it threw an `Error`.

- [#26](https://github.com/cheziyi/open-tuya/pull/26) [`69ac578`](https://github.com/cheziyi/open-tuya/commit/69ac578ca62b48b0fc26d7ef743c4c3d283eba02) Thanks [@cheziyi](https://github.com/cheziyi)! - `startSimulatedDevice` takes `ip`, the address the device broadcasts as its own.

- [#11](https://github.com/cheziyi/open-tuya/pull/11) [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873) Thanks [@cheziyi](https://github.com/cheziyi)! - A simulated device now has a `deviceId` and a `productKey`, sends its UDP broadcast with `broadcast`, and on 3.5 answers a discovery request sent to its `requestPort`.

- [#23](https://github.com/cheziyi/open-tuya/pull/23) [`fc8643e`](https://github.com/cheziyi/open-tuya/commit/fc8643e4ffa3e0852a0e146660596070d76b0b11) Thanks [@cheziyi](https://github.com/cheziyi)! - Simulate a gateway: `startSimulatedDevice` takes `subDevices` by node ID, `report` takes a node ID, and `offline` holds the node IDs the gateway reports offline.

- [#28](https://github.com/cheziyi/open-tuya/pull/28) [`2a126e7`](https://github.com/cheziyi/open-tuya/commit/2a126e73fbc0b8321258bed22b2cf5990a90d4ad) Thanks [@cheziyi](https://github.com/cheziyi)! - Simulate a 3.1 device: plain-text replies, a sealed STATUS, a plain-text broadcast, and no answer to a write under another key.

- [#29](https://github.com/cheziyi/open-tuya/pull/29) [`8e02172`](https://github.com/cheziyi/open-tuya/commit/8e02172f68bd03347ca25639f1fa19537314fcfd) Thanks [@cheziyi](https://github.com/cheziyi)! - Simulate a 3.2 device, and a device that refuses a read with `refusesReads`. A write naming a data point with null reports its value rather than setting it.
- Updated dependencies [[`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f), [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc), [`d7d5e08`](https://github.com/cheziyi/open-tuya/commit/d7d5e08edb24c7fcc482f829111a30c554ee45fc), [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`bd7645b`](https://github.com/cheziyi/open-tuya/commit/bd7645b7e3406b714b3ba34ce475f8f928370b1d), [`2a126e7`](https://github.com/cheziyi/open-tuya/commit/2a126e73fbc0b8321258bed22b2cf5990a90d4ad), [`8e02172`](https://github.com/cheziyi/open-tuya/commit/8e02172f68bd03347ca25639f1fa19537314fcfd), [`383dfbc`](https://github.com/cheziyi/open-tuya/commit/383dfbcf89920c02fbb81da30b7eece66bb245f7), [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19)]:
  - @open-tuya/core@0.1.0

## 0.0.2

### Patch Changes

- [#9](https://github.com/cheziyi/open-tuya/pull/9) [`75d11fb`](https://github.com/cheziyi/open-tuya/commit/75d11fb6afcf79cff49b00b9b865c67456da3c1c) Thanks [@cheziyi](https://github.com/cheziyi)! - A simulated device now holds data points: it answers reads and writes, reports changes with `report`, and can stop pushing after a write with `pushesAfterWrite`.

- [#8](https://github.com/cheziyi/open-tuya/pull/8) [`c1443d9`](https://github.com/cheziyi/open-tuya/commit/c1443d993e6178e6d03bc4bcc607fe5f264089f9) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `startSimulatedDevice`: a 3.3, 3.4 or 3.5 device on 127.0.0.1 that agrees a session key, answers heartbeats, pushes frames and records what its client sends.

- [#10](https://github.com/cheziyi/open-tuya/pull/10) [`0136431`](https://github.com/cheziyi/open-tuya/commit/0136431fb7544e0db14a9c9d0534194ac3c9102d) Thanks [@cheziyi](https://github.com/cheziyi)! - A simulated device writes its version header as Tuya's firmware does, with a serial number and source ID 1, and records the serial number and source ID of each client frame in `received`.
- Updated dependencies [[`c1443d9`](https://github.com/cheziyi/open-tuya/commit/c1443d993e6178e6d03bc4bcc607fe5f264089f9), [`050676f`](https://github.com/cheziyi/open-tuya/commit/050676f6bb225c21e02ca4a0ccbe0923a18d0795), [`75d11fb`](https://github.com/cheziyi/open-tuya/commit/75d11fb6afcf79cff49b00b9b865c67456da3c1c), [`33b888e`](https://github.com/cheziyi/open-tuya/commit/33b888e8d65c74b2764c70ac71196fbbe0f3d77e)]:
  - @open-tuya/core@0.0.2

## 0.0.1

### Patch Changes

- [`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f) Thanks [@cheziyi](https://github.com/cheziyi)! - Publish an empty package from the release workflow, to set up trusted publishing. It exports nothing yet.
- Updated dependencies [[`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f)]:
  - @open-tuya/core@0.0.1
