# Design

## Packages

`open-tuya` is the package most callers install: it bundles the others behind
`createTuyaClient`. Each part it bundles is its own package under the
`@open-tuya` scope:

- `@open-tuya/local`, `@open-tuya/cloud-developer` and `@open-tuya/cloud-app`
  each reach a device by one route, so a caller installs the code of the
  routes they use alone.
- `@open-tuya/cloud-developer` and `@open-tuya/cloud-app` each release when
  Tuya changes its API, which happens more often than the LAN protocol
  changes. [Cloud logins](#cloud-logins) says why they are two packages.
- `@open-tuya/devices` releases each time a device is added.
- `@open-tuya/simulators` is installed only as a dev dependency.
- `@open-tuya/core` holds the types and errors the others all use, so none of
  them depends on another.

`open-tuya` depends on the others through `^` ranges, so a minor or patch
release of one reaches its callers without a release of `open-tuya`.

Separate packages make the layers a dependency rule: pnpm links a package only
to what it lists, so `@open-tuya/local` cannot import a cloud package.

Rejected: one `open-tuya` package with subpath exports, and one with the
catalog split out. Either way, `local` importing the cloud code is held back
only by a rule in `AGENTS.md`, and a caller who wants no cloud code still
installs it.

## Simulators

`@open-tuya/simulators` depends on `@open-tuya/core` alone, and writes its
framing and encryption itself. A test of `@open-tuya/local` against a simulator
then runs two implementations against each other, and a bug in either fails
it. A simulator built on `@open-tuya/local` would share its bugs and pass.

`@open-tuya/local` takes it as a dev dependency alone: its tests run a
`TuyaConnection` against a simulated device over loopback, and a caller of
`@open-tuya/local` never installs it.

## Cloud logins

Each way of signing in to the Tuya cloud is its own package:

| Package | Signs in | Trade-off |
| --- | --- | --- |
| `@open-tuya/cloud-developer` | With a Tuya developer project's access ID and secret | The documented API, but the caller has to create a project, and its free trial lapses |
| `@open-tuya/cloud-app` | By scanning a QR code with the Smart Life app | No developer project, and the way tuya-local signs in, but the API is undocumented |

They are two packages because they are two APIs, on different hosts with
different request signing and tokens, and share no wire code. The types they
share are in `@open-tuya/core`, which defines the one cloud interface both
implement, so `createTuyaClient` takes either as a route beside the LAN, in
the order the caller gives. A caller uses one of them, and the undocumented
one can be fixed and released alone.

Rejected: one cloud package with both logins. A caller would install the
code of the login they do not use, and a fix to one would release both.

## Protocol versions

`@open-tuya/local` speaks 3.3, 3.4 and 3.5 first. 3.4 and 3.5 negotiate a
session key, which is the hard part to get right. 3.1 comes after them, as
it is found only on old devices.

## Catalog

`@open-tuya/devices` is converted from tuya-local's device files by
`scripts/`, and the script runs again each time tuya-local adds devices. A new
device goes to tuya-local, so the two projects share one catalog rather than
splitting their contributors.

Each entry is a TypeScript file, `export default { … } satisfies
TuyaDeviceEntry`, so `tsc` checks every entry against the type:

- Rejected: tuya-local's YAML as it is. It describes a device as Home
  Assistant entities, and nothing checks a YAML file against our types.
- Rejected: JSON. TypeScript widens a JSON string to `string`, so `tsc` cannot
  catch a wrong value such as an unknown mode.

A device whose product has no entry could later be named by Tuya's standard
data point codes for its category, such as `temp_set`; the cloud reports each
device's codes.

## Releases

Changesets versions and publishes the packages, each with its own version.
Each pull request carries a changeset. On `main`, the release workflow opens a
Version Packages pull request that collects them, and merging it publishes
every package whose version changed. A package that depends on a changed one
gets its own bump from Changesets.

- Rejected: one version for every package. A catalog-only change would
  release every other package unchanged.
- Rejected: release-please. It takes each bump from a Conventional Commits
  message, so a badly worded commit gives a wrong bump.
- Rejected: hand-made tags, one per package. Nothing would release the
  packages that depend on a changed one.

`.changeset/config.json` sets:

- `access` to `public`: npm publishes a scoped package as restricted by
  default, and a restricted package needs a paid npm organization.
- `changelog` to `@changesets/changelog-github`: each changelog line links its
  pull request and thanks its author.

The release workflow builds and packs in a job without `id-token: write`, and
publishes in a separate job that runs no build script.

## Package manifests

- The root `test` script builds first: a package's `tsc` reads the `dist` of
  the packages it depends on.
- Each package's `test` runs `vitest run --passWithNoTests`: vitest fails a
  package with no test files, and a package has none until its first code.
- Each package holds its own copy of `LICENSE`: npm packs only the files
  inside the package's folder.
- `vitest` and `@vitest/coverage-v8` are pinned to the same exact version:
  `@vitest/coverage-v8` takes as a peer only the `vitest` version it was
  released with, so a caret on `vitest` lets the two drift apart.

## Errors

Every package throws a `TuyaError`, and a caller tells one failure from
another by its `code`.

Rejected: a subclass for each failure a caller handles differently.

- A caller would import a class for each failure and test each with
  `instanceof`, where a `code` is one string to switch on.
- A subclass would carry nothing a `code` does not.

## Protocol 3.3

Where the sources disagree on a protocol fact, `@open-tuya/local` takes what
most of them do, and the most recent change on a tie. Four count as
independent: [tinytuya](https://github.com/jasonacox/tinytuya),
[tuyapi](https://github.com/codetheweb/tuyapi),
[homebridge-tuya-lan](https://github.com/AMoo-Miki/homebridge-tuya-lan) and
[python-tuya](https://github.com/clach04/python-tuya), with
[hass-localtuya](https://github.com/xZetsubou/hass-localtuya) for what it
changed in tinytuya's code. These count for nothing:

| Source | Why |
| --- | --- |
| rospogrigio/localtuya | Its protocol code is tinytuya's since 2023 |
| mileperhour/localtuya-homeassistant | A copy of python-tuya, 3.1 alone |
| iRayanKhan/homebridge-tuya, adrianjagielak/homebridge-tuya-plus | Their 3.3 code is homebridge-tuya-lan's |
| TuyaAPI/stub, Apollon77/ioBroker.tuya | Built on tuyapi |
| simensma/tuyamqtt, iamjond/tuyagateway | Their protocol code is in libraries not cloned here |

| Question | Chosen | For | Against |
| --- | --- | --- | --- |
| Which commands go without the "3.3" header | `HEART_BEAT`, `DP_QUERY`, `DP_QUERY_NEW` and `UPDATEDPS` | tinytuya [`0c68f4b`](https://github.com/jasonacox/tinytuya/commit/0c68f4b4d40c16fb82586a37afe43588116920e4), 2022, all four; homebridge-tuya-lan [`45ad489`](https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6) for `HEART_BEAT` and `DP_QUERY`; tuyapi [`4be9cc5`](https://github.com/codetheweb/tuyapi/commit/4be9cc5de3048ab0f5eb97674ca964112d1d9452) for `DP_QUERY` and `UPDATEDPS` | tuyapi [`ab5c85e`](https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db) and [`4be9cc5`](https://github.com/codetheweb/tuyapi/commit/4be9cc5de3048ab0f5eb97674ca964112d1d9452), 2021, put it on `HEART_BEAT` and `DP_QUERY_NEW` |
| Whether a frame from a device carries a return code | Always | tinytuya [`ee995bf`](https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a), 2021; python-tuya [`25d8b08`](https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674) | tuyapi [`31a0cab`](https://github.com/codetheweb/tuyapi/commit/31a0cabf76149e29391b08409f9be1bfa7cabc0c) and homebridge-tuya-lan [`45ad489`](https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6), both 2019, take one only when the top 24 bits of its word are zero |
| What a heartbeat carries | An empty payload | tuyapi [`dab8173`](https://github.com/codetheweb/tuyapi/commit/dab81737a350b3f1b8ea85252cc48f472a651e2d), 2018; homebridge-tuya-lan [`45ad489`](https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6), 2019 | tinytuya [`99d8ac8`](https://github.com/jasonacox/tinytuya/commit/99d8ac8dda60b626891f2927ab2457315bca53e6), 2021, sends `{"gwId":…,"devId":…}` |
| Whether an empty 3.3 payload is encrypted | It is, to one block of padding | tuyapi [`ab5c85e`](https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db), 2019; tinytuya [`ee995bf`](https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a), 2021 | homebridge-tuya-lan [`45ad489`](https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6) sends it as no bytes |
| Which received payloads lose the "3.3" header | One that starts with "3.3" | tinytuya [`ee995bf`](https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a); tuyapi [`ab5c85e`](https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db) | homebridge-tuya-lan searches the whole frame for "3.3"; python-tuya never strips it |

## Protocol 3.4 and 3.5

The rules of [Protocol 3.3](#protocol-33) hold: a frame from a device carries
a return code. Five projects implement 3.4 or 3.5 independently: tinytuya,
tuyapi, iRayanKhan/homebridge-tuya for 3.4, adrianjagielak/homebridge-tuya-plus
for 3.5, and hass-localtuya where it changed tinytuya's code. rospogrigio/localtuya's
3.4 code is tinytuya's.

| Question | Chosen | For | Against |
| --- | --- | --- | --- |
| Which commands go without the version header | `SESS_KEY_NEG_START`, `SESS_KEY_NEG_FINISH`, `HEART_BEAT`, `DP_QUERY`, `DP_QUERY_NEW` and `UPDATEDPS` | tinytuya [`0c68f4b`](https://github.com/jasonacox/tinytuya/commit/0c68f4b4d40c16fb82586a37afe43588116920e4), tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e), iRayanKhan [`ea1d903`](https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a) | tinytuya alone also skips `SESS_KEY_NEG_RESP` and `LAN_EXT_STREAM`, which a client does not send |
| Whether a frame from a 3.4 device always carries a return code | Always, as on 3.3: the two differ only for a frame without one, and no source shows a device that sends one | tinytuya [`a60ffc6`](https://github.com/jasonacox/tinytuya/commit/a60ffc61484b164f588e2e6685810cfbd262de8f) | tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e) keeps its 3.3 guess from the top 24 bits; iRayanKhan copies homebridge-tuya-lan's |
| The sequence number of `SESS_KEY_NEG_FINISH` | The client's next, after `SESS_KEY_NEG_START`'s | tinytuya [`d0ee0be`](https://github.com/jasonacox/tinytuya/commit/d0ee0be3d0034bb9d8848dde6054d68d1102bf8b), iRayanKhan [`ea1d903`](https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a), homebridge-tuya-plus [`e316a91`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86) | tuyapi [`e125a2e`](https://github.com/codetheweb/tuyapi/commit/e125a2e17f3043ed6263f092d154c72bf6d1ecdb), 2024, and rospogrigio/localtuya [`957cf25`](https://github.com/rospogrigio/localtuya/commit/957cf25dd0af995c496a5644c7a773b46a426b04), 2023, a change of its own, give it the number of the device's `SESS_KEY_NEG_RESP` |
| How a device numbers its frames | From a counter of its own, not the request's | rospogrigio/localtuya [`957cf25`](https://github.com/rospogrigio/localtuya/commit/957cf25dd0af995c496a5644c7a773b46a426b04) for 3.4; tuyapi [`e125a2e`](https://github.com/codetheweb/tuyapi/commit/e125a2e17f3043ed6263f092d154c72bf6d1ecdb) for 3.4 and 3.5; tinytuya [`a2486e8`](https://github.com/jasonacox/tinytuya/commit/a2486e834cefeec85da7fb012136d9235acc50b3) for 3.5 | tinytuya [`a2486e8`](https://github.com/jasonacox/tinytuya/commit/a2486e834cefeec85da7fb012136d9235acc50b3) has a 3.4 device answer with the request's number |
| Whether the first 4 bytes of a 3.5 plaintext are a return code | Always | tinytuya [`c2f3e24`](https://github.com/jasonacox/tinytuya/commit/c2f3e24d968c5d23ffd4e71956b46028563f422f), tuyapi [`96af23b`](https://github.com/codetheweb/tuyapi/commit/96af23b59f5dac4a10ef81afd8cc94e85b1ed6d9) | homebridge-tuya-plus [`e316a91`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86) takes them only when the whole plaintext is not JSON |

## Received frames

What `@open-tuya/local` does with the bytes a device sends is its own design,
decided on its merits rather than by what the sources do.

| Choice | Why |
| --- | --- |
| A frame ends where its length field says | Nothing escapes the suffix: a ciphertext, an HMAC or a tag can hold its four bytes, and a reader that stops at them cuts the frame short |
| A length field over 102,400 throws `MALFORMED_FRAME` | A corrupt length field would otherwise leave the reader waiting for bytes that never come. A cap below the largest frame a device sends would cut that device off on every connection, while a cap too high only holds a corrupt stream until the heartbeats run out. No source shows the largest frame, so the cap sits far above tinytuya's 1440 and hass-localtuya's 2000, and bounds what the reader buffers |
| A frame whose CRC is wrong is left out, with a `MALFORMED_FRAME` error | Its bytes are not the ones the device sent, so acting on them acts on noise. The frames after it were cut at their own length fields, so they are read |
| A wrong suffix is ignored | The CRC, HMAC or tag covers the length field, so a frame that passes it was cut at the right byte, and the suffix tells nothing more |
| A 3.4 frame whose HMAC or a 3.5 frame whose tag is wrong is left out, with a `DECRYPTION_FAILED` error | The frame was not sealed under the key held: the local key, the session key or the protocol version is wrong, and the caller has to hear that |
| A payload that does not decrypt is left out, with a `DECRYPTION_FAILED` error | Read as plaintext, it would surface later as a JSON error that hides the wrong key |
| A session key reply whose HMAC is wrong throws `SESSION_KEY_NEGOTIATION_FAILED` | The device holds a different local key, so every frame after it would fail: stopping here names the cause |

## Connection

`TuyaConnection` holds one device's TCP connection. Each choice below is the
library's own, decided on its merits.

| Choice | Why |
| --- | --- |
| The connection stays open, and never reconnects itself | A device pushes its changes only down an open connection, and a 3.4 or 3.5 connection costs a session key negotiation to open. Whether to reconnect, and when, is the caller's decision: `LocalTuyaClient` makes it |
| `openConnection` resolves once the session key is agreed | A connection a caller holds can always send |
| `onFrame`, `onDroppedFrame` and `onClose` are options to `openConnection` | A connection has one reader, so an emitter's many listeners buy nothing. The callbacks exist before the socket opens, so no frame arrives with nothing listening, and `tsc` rejects a caller who forgets `onClose`, where Node throws on an `'error'` event nobody listens to |
| A frame that fails its check is dropped and passed to `onDroppedFrame`; the connection stays open | One bad frame costs no other frame. The caller hears of it, as it most often means a wrong key or version |
| A length field out of range closes the connection with `CONNECTION_LOST` | The reader has lost its place in the stream: waiting for that many bytes would stall it until the heartbeats ran out |
| No timeout on a reply | The connection does not match replies to requests: a device numbers its frames from a counter of its own. `LocalTuyaClient` waits for the reply it expects |
| A heartbeat every 10 s; the connection is lost once 2 in a row go unanswered | A device closes a connection that carries nothing for 30 s, and two misses tell a lost device from one late reply. Only a heartbeat reply counts, as a device can go on pushing after it stops answering |
| 5 s to connect, 10 s to agree a session key, no retry | A device on the LAN answers well within either. A retry belongs to the caller, who knows whether the key or the address was wrong |
| A random nonce for each connection and a random IV for each 3.5 frame | GCM under one key must never take the same IV twice |
| `setNoDelay(true)` | Each frame is a small request whose reply is awaited, so Nagle's algorithm would only hold it back |
| No TCP keepalive | The heartbeat already finds a lost device, sooner |
| Sequence numbers start at 1 for each connection and wrap at 2^32 | The field is 32 bits, and nothing matches on it |
