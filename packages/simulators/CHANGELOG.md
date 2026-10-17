# @open-tuya/simulators

## 0.0.3

### Patch Changes

- [#11](https://github.com/cheziyi/open-tuya/pull/11) [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873) Thanks [@cheziyi](https://github.com/cheziyi)! - A simulated device closes at the end of an `await using` scope, and closing it twice is safe.

- [#11](https://github.com/cheziyi/open-tuya/pull/11) [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873) Thanks [@cheziyi](https://github.com/cheziyi)! - A simulated device now has a `deviceId` and a `productKey`, sends its UDP broadcast with `broadcast`, and on 3.5 answers a discovery request sent to its `requestPort`.
- Updated dependencies [[`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f), [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc), [`d7d5e08`](https://github.com/cheziyi/open-tuya/commit/d7d5e08edb24c7fcc482f829111a30c554ee45fc), [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873)]:
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
