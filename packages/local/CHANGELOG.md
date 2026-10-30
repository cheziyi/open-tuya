# @open-tuya/local

## 0.2.2

### Patch Changes

- Updated dependencies [[`c4223c8`](https://github.com/cheziyi/open-tuya/commit/c4223c8801d1bab59e31fbef8495b8ae8b16744c)]:
  - @open-tuya/core@0.2.0

## 0.2.1

### Patch Changes

- [#40](https://github.com/cheziyi/open-tuya/pull/40) [`3bf52fc`](https://github.com/cheziyi/open-tuya/commit/3bf52fcc0b53e16f934f176a060b9f8460132b27) Thanks [@cheziyi](https://github.com/cheziyi)! - Show a README on the package's npm page, with an example and links to the full documentation.
- Updated dependencies [[`3bf52fc`](https://github.com/cheziyi/open-tuya/commit/3bf52fcc0b53e16f934f176a060b9f8460132b27)]:
  - @open-tuya/core@0.1.1

## 0.2.0

### Minor Changes

- [#11](https://github.com/cheziyi/open-tuya/pull/11) [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873) Thanks [@cheziyi](https://github.com/cheziyi)! - `TuyaConnection.close()` and `LocalTuyaClient.close()` now return a promise that resolves once the socket is released. `TuyaConnection`, `LocalTuyaClient` and `TuyaDiscovery` close at the end of an `await using` scope.

- [#35](https://github.com/cheziyi/open-tuya/pull/35) [`5f2e1f8`](https://github.com/cheziyi/open-tuya/commit/5f2e1f8c065db03013cafdd647e8f0fcd40a6d48) Thanks [@cheziyi](https://github.com/cheziyi)! - `decodeFrames`, `decodeV34Frames`, `decodeV35Frames` and `decodeMessages` no longer throw for a length field out of range: they return the whole frames before it and set `malformed`, and `TuyaConnection` hands those frames on before it closes. A read by writing null waits for its ack, a closed device behind a gateway is no longer read after a reconnect, and a 3.3 gateway is read with `DP_QUERY_NEW` and asked which devices are online.

- [#26](https://github.com/cheziyi/open-tuya/pull/26) [`69ac578`](https://github.com/cheziyi/open-tuya/commit/69ac578ca62b48b0fc26d7ef743c4c3d283eba02) Thanks [@cheziyi](https://github.com/cheziyi)! - Follow a device to a new address: pass `discovery` to `createLocalTuyaClient`, and after a lost connection or a failed connect the client tries the address the discovery last heard the device at, returning to the last address that worked if that fails too. `TuyaDiscovery.devices` holds the latest report from each device, and `onDevice` is optional. `LocalTuyaClient`'s constructor now takes the host, and passes the address to connect to as the first argument of its connect function.

- [#28](https://github.com/cheziyi/open-tuya/pull/28) [`2a126e7`](https://github.com/cheziyi/open-tuya/commit/2a126e73fbc0b8321258bed22b2cf5990a90d4ad) Thanks [@cheziyi](https://github.com/cheziyi)! - Speak protocol 3.1: `createLocalTuyaClient` reads and writes a 3.1 device, and `discoverDevices` listens on UDP port 6666 for its broadcasts, so a program holding that port without sharing it now fails discovery with `DISCOVERY_FAILED`. Under a wrong local key a 3.1 read still succeeds and a write times out. `TuyaDiscovery`'s constructor takes its broadcast sockets as a list.

- [#29](https://github.com/cheziyi/open-tuya/pull/29) [`8e02172`](https://github.com/cheziyi/open-tuya/commit/8e02172f68bd03347ca25639f1fa19537314fcfd) Thanks [@cheziyi](https://github.com/cheziyi)! - Speak protocol 3.2, and read a device that refuses a read by writing null to the data points named in `readByWritingNull`, on 3.2 and 3.3. `LocalTuyaClient`'s constructor takes its version, device ID, host and discovery in one options object.

### Patch Changes

- [#17](https://github.com/cheziyi/open-tuya/pull/17) [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `LocalTuyaClient.connected`, true while its connection is open.

- [#11](https://github.com/cheziyi/open-tuya/pull/11) [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `discoverDevices`, which reports each device on the LAN with its address, device ID, protocol version and product key, ready to pass to `createLocalTuyaClient`, and asks 3.5 devices that stay silent to answer.

- [#23](https://github.com/cheziyi/open-tuya/pull/23) [`fc8643e`](https://github.com/cheziyi/open-tuya/commit/fc8643e4ffa3e0852a0e146660596070d76b0b11) Thanks [@cheziyi](https://github.com/cheziyi)! - Reach the devices behind a gateway, such as Zigbee and Bluetooth devices, over the gateway's connection: `LocalTuyaClient.createClient(nodeId)` gives a `SubDeviceTuyaClient`, and on 3.4 and 3.5 the gateway is asked every 30 s which devices are online.

- [#30](https://github.com/cheziyi/open-tuya/pull/30) [`41f1a7d`](https://github.com/cheziyi/open-tuya/commit/41f1a7de13050f4cba81f66c1dd6fa8a1e33bac3) Thanks [@cheziyi](https://github.com/cheziyi)! - Send a 3.3 heartbeat as an empty payload, as on every other version, rather than one encrypted block of padding.

- [#24](https://github.com/cheziyi/open-tuya/pull/24) [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19) Thanks [@cheziyi](https://github.com/cheziyi)! - Support Node 22.12 and later, down from 22.19.
- Updated dependencies [[`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f), [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc), [`d7d5e08`](https://github.com/cheziyi/open-tuya/commit/d7d5e08edb24c7fcc482f829111a30c554ee45fc), [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`bd7645b`](https://github.com/cheziyi/open-tuya/commit/bd7645b7e3406b714b3ba34ce475f8f928370b1d), [`2a126e7`](https://github.com/cheziyi/open-tuya/commit/2a126e73fbc0b8321258bed22b2cf5990a90d4ad), [`8e02172`](https://github.com/cheziyi/open-tuya/commit/8e02172f68bd03347ca25639f1fa19537314fcfd), [`383dfbc`](https://github.com/cheziyi/open-tuya/commit/383dfbcf89920c02fbb81da30b7eece66bb245f7), [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19)]:
  - @open-tuya/core@0.1.0

## 0.1.0

### Minor Changes

- [#9](https://github.com/cheziyi/open-tuya/pull/9) [`75d11fb`](https://github.com/cheziyi/open-tuya/commit/75d11fb6afcf79cff49b00b9b865c67456da3c1c) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `createLocalTuyaClient`, which reads and writes a device's data points over the LAN, hands on what the device reports, and reconnects after a loss. A 3.5 frame's `returnCode` is now read little-endian, as a device writes it.

- [#8](https://github.com/cheziyi/open-tuya/pull/8) [`c1443d9`](https://github.com/cheziyi/open-tuya/commit/c1443d993e6178e6d03bc4bcc607fe5f264089f9) Thanks [@cheziyi](https://github.com/cheziyi)! - Add `openConnection`, which opens a `TuyaConnection` to a 3.3, 3.4 or 3.5 device, agrees the session key, and keeps the connection alive with heartbeats. `decodeFrames`, `decodeV34Frames` and `decodeV35Frames` no longer throw for a frame whose CRC, HMAC or tag is wrong: they leave it out and return its error in `errors`. They accept a length field up to 102,400, not 1440.

### Patch Changes

- [#2](https://github.com/cheziyi/open-tuya/pull/2) [`33b888e`](https://github.com/cheziyi/open-tuya/commit/33b888e8d65c74b2764c70ac71196fbbe0f3d77e) Thanks [@cheziyi](https://github.com/cheziyi)! - Add protocol 3.3 framing and encryption: `encodeFrame`, `decodeFrames`, `encryptV33Payload`, `decryptV33Payload` and the `COMMANDS` they take.

- [#4](https://github.com/cheziyi/open-tuya/pull/4) [`050676f`](https://github.com/cheziyi/open-tuya/commit/050676f6bb225c21e02ca4a0ccbe0923a18d0795) Thanks [@cheziyi](https://github.com/cheziyi)! - Add protocol 3.4 and 3.5 framing and encryption (`encodeV34Frame`, `decodeV34Frames`, `encryptV34Payload`, `decryptV34Payload`, `encodeV35Frame`, `decodeV35Frames`, `encodeV35Payload`, `decodeV35Payload`) and the pieces of the session key negotiation (`parseSessionKeyResponse`, `buildSessionKeyFinish`, `deriveV34SessionKey`, `deriveV35SessionKey`). `decodeFrames` now throws `MALFORMED_FRAME` for a frame whose CRC is wrong, and 3.3 sends `DP_QUERY_NEW` without the version header.

- [#10](https://github.com/cheziyi/open-tuya/pull/10) [`0136431`](https://github.com/cheziyi/open-tuya/commit/0136431fb7544e0db14a9c9d0534194ac3c9102d) Thanks [@cheziyi](https://github.com/cheziyi)! - Only `CONTROL` and `CONTROL_NEW` carry the version header, which now holds a serial number and a source ID: `LocalTuyaClient` numbers its writes from 1 under a source ID of its own, and `send`, `encryptV33Payload`, `encryptV34Payload` and `encodeV35Payload` take them as `VersionHeaderFields`. A 3.4 heartbeat goes with no payload, and request bodies list their keys in alphabetical order.
- Updated dependencies [[`c1443d9`](https://github.com/cheziyi/open-tuya/commit/c1443d993e6178e6d03bc4bcc607fe5f264089f9), [`050676f`](https://github.com/cheziyi/open-tuya/commit/050676f6bb225c21e02ca4a0ccbe0923a18d0795), [`75d11fb`](https://github.com/cheziyi/open-tuya/commit/75d11fb6afcf79cff49b00b9b865c67456da3c1c), [`33b888e`](https://github.com/cheziyi/open-tuya/commit/33b888e8d65c74b2764c70ac71196fbbe0f3d77e)]:
  - @open-tuya/core@0.0.2

## 0.0.1

### Patch Changes

- [`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f) Thanks [@cheziyi](https://github.com/cheziyi)! - Publish an empty package from the release workflow, to set up trusted publishing. It exports nothing yet.
- Updated dependencies [[`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f)]:
  - @open-tuya/core@0.0.1
