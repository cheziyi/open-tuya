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
| Which commands carry the version header, on every version | `CONTROL` and `CONTROL_NEW` alone. Among the commands a client sends, every source puts it on those two and no others | Tuya's firmware [`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1) reads it on those two alone, and reads a query as plain JSON, which a header would break | tinytuya [`0c68f4b`](https://github.com/jasonacox/tinytuya/commit/0c68f4b4d40c16fb82586a37afe43588116920e4) and tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e) list the commands without it instead, so a command missing from the list, such as `0x40`, would carry it |
| What the version header holds after the version | A zero CRC, then the sender's serial number and its source ID, each 4 bytes big-endian. A device reads them and uses neither | Tuya's firmware [`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1); a device's header captured in [tinytuya discussion #260](https://github.com/jasonacox/tinytuya/discussions/260#discussioncomment-14066063) | tinytuya and tuyapi write zeros |
| Whether a frame from a device carries a return code | Always | tinytuya [`ee995bf`](https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a), 2021; python-tuya [`25d8b08`](https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674) | tuyapi [`31a0cab`](https://github.com/codetheweb/tuyapi/commit/31a0cabf76149e29391b08409f9be1bfa7cabc0c) and homebridge-tuya-lan [`45ad489`](https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6), both 2019, take one only when the top 24 bits of its word are zero |
| What a heartbeat carries | An empty payload | tuyapi [`dab8173`](https://github.com/codetheweb/tuyapi/commit/dab81737a350b3f1b8ea85252cc48f472a651e2d), 2018; homebridge-tuya-lan [`45ad489`](https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6), 2019 | tinytuya [`99d8ac8`](https://github.com/jasonacox/tinytuya/commit/99d8ac8dda60b626891f2927ab2457315bca53e6), 2021, sends `{"gwId":…,"devId":…}` |
| Whether an empty 3.3 payload is encrypted | It is, to one block of padding | tuyapi [`ab5c85e`](https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db), 2019; tinytuya [`ee995bf`](https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a), 2021 | homebridge-tuya-lan [`45ad489`](https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6) sends it as no bytes |
| Which received payloads lose the "3.3" header | One that starts with "3.3" | tinytuya [`ee995bf`](https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a); tuyapi [`ab5c85e`](https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db) | homebridge-tuya-lan searches the whole frame for "3.3"; python-tuya never strips it |

## Protocol 3.4 and 3.5

The rules of [Protocol 3.3](#protocol-33) hold: a frame from a device carries
a return code, and only `CONTROL` and `CONTROL_NEW` carry the version header.
Five projects implement 3.4 or 3.5 independently: tinytuya,
tuyapi, iRayanKhan/homebridge-tuya for 3.4, adrianjagielak/homebridge-tuya-plus
for 3.5, and hass-localtuya where it changed tinytuya's code. rospogrigio/localtuya's
3.4 code is tinytuya's.

| Question | Chosen | For | Against |
| --- | --- | --- | --- |
| Whether a frame from a 3.4 device always carries a return code | Always, as on 3.3: the two differ only for a frame without one, and no source shows a device that sends one | tinytuya [`a60ffc6`](https://github.com/jasonacox/tinytuya/commit/a60ffc61484b164f588e2e6685810cfbd262de8f) | tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e) keeps its 3.3 guess from the top 24 bits; iRayanKhan copies homebridge-tuya-lan's |
| The sequence number of `SESS_KEY_NEG_FINISH` | The client's next, after `SESS_KEY_NEG_START`'s | tinytuya [`d0ee0be`](https://github.com/jasonacox/tinytuya/commit/d0ee0be3d0034bb9d8848dde6054d68d1102bf8b), iRayanKhan [`ea1d903`](https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a), homebridge-tuya-plus [`e316a91`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86) | tuyapi [`e125a2e`](https://github.com/codetheweb/tuyapi/commit/e125a2e17f3043ed6263f092d154c72bf6d1ecdb), 2024, and rospogrigio/localtuya [`957cf25`](https://github.com/rospogrigio/localtuya/commit/957cf25dd0af995c496a5644c7a773b46a426b04), 2023, a change of its own, give it the number of the device's `SESS_KEY_NEG_RESP` |
| An empty 3.4 payload, as a heartbeat's | Sent as no bytes: the frame holds its header, HMAC and suffix alone | — | tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e) and iRayanKhan [`ea1d903`](https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a) encrypt it to one block of padding |
| How a device numbers its frames | From a counter of its own, not the request's | rospogrigio/localtuya [`957cf25`](https://github.com/rospogrigio/localtuya/commit/957cf25dd0af995c496a5644c7a773b46a426b04) for 3.4; tuyapi [`e125a2e`](https://github.com/codetheweb/tuyapi/commit/e125a2e17f3043ed6263f092d154c72bf6d1ecdb) for 3.4 and 3.5; tinytuya [`a2486e8`](https://github.com/jasonacox/tinytuya/commit/a2486e834cefeec85da7fb012136d9235acc50b3) for 3.5 | tinytuya [`a2486e8`](https://github.com/jasonacox/tinytuya/commit/a2486e834cefeec85da7fb012136d9235acc50b3) has a 3.4 device answer with the request's number |
| Whether the first 4 bytes of a 3.5 plaintext are a return code | Always | tinytuya [`c2f3e24`](https://github.com/jasonacox/tinytuya/commit/c2f3e24d968c5d23ffd4e71956b46028563f422f), tuyapi [`96af23b`](https://github.com/codetheweb/tuyapi/commit/96af23b59f5dac4a10ef81afd8cc94e85b1ed6d9) | homebridge-tuya-plus [`e316a91`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86) takes them only when the whole plaintext is not JSON |
| How a 3.5 return code is read | Little-endian, against the count: a device writes it in its own byte order, in Tuya's firmware [`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1), and a captured error carries `01 00 00 00` ([tinytuya#658](https://github.com/jasonacox/tinytuya/issues/658)) | Tuya's firmware; the capture | tinytuya [`c2f3e24`](https://github.com/jasonacox/tinytuya/commit/c2f3e24d968c5d23ffd4e71956b46028563f422f) and tuyapi [`96af23b`](https://github.com/codetheweb/tuyapi/commit/96af23b59f5dac4a10ef81afd8cc94e85b1ed6d9) read it big-endian, and neither acts on its value |

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

## Data points

How a client reads and writes a device's data points on the LAN. Rows marked
against the count name the source that sends the choice, and what shows a
device accepts it.

| Question | Chosen | For | Against |
| --- | --- | --- | --- |
| Which command reads and which writes | `DP_QUERY` and `CONTROL` on 3.3; `DP_QUERY_NEW` and `CONTROL_NEW` on 3.4 and 3.5 | tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e) and [`e125a2e`](https://github.com/codetheweb/tuyapi/commit/e125a2e17f3043ed6263f092d154c72bf6d1ecdb), tinytuya [`a60ffc6`](https://github.com/jasonacox/tinytuya/commit/a60ffc61484b164f588e2e6685810cfbd262de8f), iRayanKhan [`ea1d903`](https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a) | — |
| A 3.3 read | `{"gwId":id,"devId":id}` | homebridge-tuya-lan [`800ade3`](https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/800ade32914c66a60566efbb485268283c8ca86a), python-tuya [`25d8b08`](https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674) | tinytuya [`9eca3e2`](https://github.com/jasonacox/tinytuya/commit/9eca3e29456ebaadda7247358d9ef3c9e65811d1) adds `uid` and `t`; tuyapi [`d68cafc`](https://github.com/codetheweb/tuyapi/commit/d68cafc05eaa9877c7418ad66c6f02ea7385a197) adds `t`, `dps` and `uid` |
| A 3.4 or 3.5 read | `{}`, on a three-way tie. A device answers it ([tuya-local#5499](https://github.com/make-all/tuya-local/issues/5499#issuecomment-4966649152)), and Tuya's firmware reads any JSON there ([`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1)) | tinytuya [`d59fdf9`](https://github.com/jasonacox/tinytuya/commit/d59fdf9546969d0cb57faede60b82424c09d4a7b) | iRayanKhan [`ea1d903`](https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a) and homebridge-tuya-plus [`e316a91`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86) send `{"gwId","devId"}`; tuyapi the full 3.3-style body |
| A 3.3 write | `{"devId":id,"uid":"","t":…,"dps":…}` | homebridge-tuya-lan [`800ade3`](https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/800ade32914c66a60566efbb485268283c8ca86a), tuyapi [`68b164d`](https://github.com/codetheweb/tuyapi/commit/68b164d5c62e902eb7407945aef71e3a3f2cb065) | python-tuya [`1b07854`](https://github.com/clach04/python-tuya/commit/1b0785424ab34c540acb168443aa521a8a2d774b) sets `uid` to the device ID; tuyapi adds `gwId` |
| `t` in a write | An integer of whole seconds, truncated, against the count on 3.3. tuyapi has sent an integer on every version since 2019, and Tuya's firmware never reads `t` ([`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1)) | tuyapi [`461f0b3`](https://github.com/codetheweb/tuyapi/commit/461f0b3ea7887ec240c4c191dc3036b8f47981cb); tinytuya [`a60ffc6`](https://github.com/jasonacox/tinytuya/commit/a60ffc61484b164f588e2e6685810cfbd262de8f) on 3.4 and 3.5 | On 3.3, homebridge-tuya-lan rounds a string and python-tuya [`ba17258`](https://github.com/clach04/python-tuya/commit/ba17258746effadadc0e8e990d05b54efffabfe8) truncates one; that commit changed the padding too, which more likely fixed the write it reports failing |
| A 3.4 or 3.5 write | `{"data":{"dps":…},"protocol":5,"t":…}`, against the count. Tuya's firmware reads only `dps` and `devId` from `data` ([`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1)) | tinytuya [`d59fdf9`](https://github.com/jasonacox/tinytuya/commit/d59fdf9546969d0cb57faede60b82424c09d4a7b) | tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e), iRayanKhan [`ea1d903`](https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a) and homebridge-tuya-plus [`e316a91`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86) add `devId`, `uid:""` and `ctype:0` to `data` |
| Spaces in a request | None between tokens; those inside a string value are kept | tuyapi, homebridge-tuya-lan, both through `JSON.stringify` | python-tuya [`25d8b08`](https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674) removes every space, inside strings too, and tinytuya took it over |
| The order of keys in a request | Alphabetical, with the data points in the caller's order | — . Tuya's firmware parses a request whatever its order [`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1) | The sources write the keys in an order of their own |
| The reply to a read | A frame of the read's own command: return code 0 and `{"dps":…}`, which may leave data points out, or return code 1 and an error text | Tuya's firmware [`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1); captured in [tinytuya#732](https://github.com/jasonacox/tinytuya/issues/732), [tuyapi#577](https://github.com/codetheweb/tuyapi/issues/577) and [tinytuya#658](https://github.com/jasonacox/tinytuya/issues/658) | tinytuya's fake device wraps its reply in `{"protocol":4,…}`, which no capture shows |
| The reply to a write | An empty frame of the write's own command, or an error text; then, from most devices, a `STATUS` of the data points set | Tuya's firmware [`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1); tinytuya [`8528e03`](https://github.com/jasonacox/tinytuya/commit/8528e03565d6dbaeebad372903de0adcfd3d037c); captured in [tinytuya#498](https://github.com/jasonacox/tinytuya/issues/498#issuecomment-2119361833) | Some devices send no `STATUS` ([hass-localtuya#877](https://github.com/xZetsubou/hass-localtuya/issues/877)) |
| A push | `STATUS`: `{"dps":…,"t":…}` on 3.3, `{"protocol":4,"t":…,"data":{"dps":…}}` on 3.4 and 3.5, sometimes one data point a frame | Captured in [hass-localtuya#775](https://github.com/xZetsubou/hass-localtuya/issues/775), [hass-localtuya#698](https://github.com/xZetsubou/hass-localtuya/issues/698#issuecomment-3168858952) and [tinytuya discussion #260](https://github.com/jasonacox/tinytuya/discussions/260#discussioncomment-14066063) | — |

## Client

`TuyaClient` in `@open-tuya/core` is what each route implements, and
`LocalTuyaClient` the LAN's. Each choice below is the library's own.

| Choice | Why |
| --- | --- |
| Data points are keyed by ID, with the device's own values | The catalog and the LAN key them by ID, and each cloud reports a data point's ID beside its code, so a cloud client can key them the same way. Scaling belongs to the catalog |
| `onDataPoints(listener)` returns a function that removes it | A client has many readers, such as `createTuyaClient` and each part of an app. Unlike an emitter, it has no event names to mistype and no `'error'` event that crashes when nobody listens, and `@open-tuya/core` needs nothing from Node |
| A write resolves on the device's ack, not on the `STATUS` after it | The ack says the device took the write; some devices never send the `STATUS` |
| A write fails on its ack's payload alone | A device acks a write with return code 0 on 3.3 and 1 on 3.5, success or not: only an error text tells a failure |
| `LocalTuyaClient` takes the function that opens a connection | It reconnects after a loss, so it needs to open connections, and it passes its own listeners to each |
| It connects when created, and reconnects 5 s after a loss, doubling to 60 s | A device pushes its changes only down an open connection. A device that is off for a while is not hammered |
| It reads the data points after each connect, and hands them to the listeners | A listener learns what it missed while the connection was down |
| One request at a time, matched to its reply by command | A 3.4 or 3.5 device numbers its frames from a counter of its own, so the command is all a reply shares with its request |
| 5 s for a reply or an ack | A device on the LAN answers in milliseconds |
| A frame the connection drops fails the request waiting on it | A dropped frame most often means a wrong key, which the caller hears at once rather than after 5 s |
| An error that is not a `TuyaError`, such as a local key of the wrong length, stops the reconnecting | It fails every connection alike |
| A write's version header carries a serial number from 1 and a source ID drawn at random from 1000 to 1,000,999, both kept for the client's life | A device uses neither. The source ID tells senders apart, so two clients draw different ones; a serial that restarted at each reconnect would repeat a pair |
| No `UPDATEDPS` | Nothing needs it yet, and some devices answer it with "query dp failed" and close the connection ([hass-localtuya#784](https://github.com/xZetsubou/hass-localtuya/issues/784)) |

## Discovery

`discoverDevices` listens on UDP ports 6667 and 7000, and asks 3.5 devices to
answer. Where the sources disagree on a protocol fact:

| Question | Chosen | For | Against |
| --- | --- | --- | --- |
| What a request puts in `ip` | The address of the interface the request leaves by, against the most recent change. A device sends its answer to that address ([`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1)), so it has to be one the device reaches | tinytuya [`831f113`](https://github.com/jasonacox/tinytuya/commit/831f1131f17e6110c814c7d912e44a192fddb002), 2024 | homebridge-tuya-plus [`b3cb091`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/b3cb091641238dc00b9b62b7d16795ffeb9acdef), 2026, sends `255.255.255.255` |
| Which address a client connects to | The broadcast's `ip` field | tuyapi [`ab5db86`](https://github.com/codetheweb/tuyapi/commit/ab5db864d86fe46fc045b490d6213f4ce5713c27), homebridge-tuya-lan [`800ade3`](https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/800ade32914c66a60566efbb485268283c8ca86a), rospogrigio/localtuya [`1e23120`](https://github.com/rospogrigio/localtuya/commit/1e2312087238eb22f9aa03e59ac5336b4dc0054c), homebridge-tuya-plus | tinytuya [`a495c69`](https://github.com/jasonacox/tinytuya/commit/a495c694990c386004f7780217afaa6832d45fa0) takes the address the datagram came from |
| Whether the first 4 bytes of a 3.5 broadcast's plaintext are a return code | Always: Tuya's firmware writes one ([`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1)), and both captures carry it | tuyapi [`96af23b`](https://github.com/codetheweb/tuyapi/commit/96af23b59f5dac4a10ef81afd8cc94e85b1ed6d9) | tinytuya [`5742dcb`](https://github.com/jasonacox/tinytuya/commit/5742dcb99ef3c17d86b31470ed98b1acaed4e739) takes them only when the JSON starts after them; homebridge-tuya-plus [`e316a91`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86) only when they are zero |
| What a 3.4 broadcast ends with | A CRC32, as on 3.3, where a 3.4 TCP frame carries an HMAC. The capture's CRC holds | tuyapi [`45e0ae8`](https://github.com/codetheweb/tuyapi/commit/45e0ae8cb3064a89edf57255f42efcc9fc338769); captured in hass-localtuya [`aeb5f9c`](https://github.com/xZetsubou/hass-localtuya/commit/aeb5f9ce4c07c57e7868f296978fed4a2a5e9f18) | tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e) checked an HMAC until `45e0ae8` |

What `discoverDevices` does with what it receives is its own design:

| Choice | Why |
| --- | --- |
| `onDevice` is an option, and `close()` stops it | UDP pushes, so an async iterator would buffer without bound behind a slow reader. A scan that resolves after a timeout could not report a device's next broadcast, which a caller waiting to reconnect needs; a caller who wants a scan closes the discovery after a while |
| Every broadcast and answer is reported | A device repeats its broadcast every few seconds, and each one says it is still there. A caller who wants a list keys it by `deviceId` |
| Ports 6667 and 7000, not 6666 | 6666 carries 3.1 alone, which `@open-tuya/local` does not speak |
| A device of another version is left out | `version` then goes to `createLocalTuyaClient` as it is |
| A request every 6 s, to each IPv4 interface's subnet broadcast address, with the interfaces listed again each time | Some 3.5 devices answer only when asked, and UDP loses datagrams. A request to 255.255.255.255 leaves by one interface alone, and listing the interfaces again finds a laptop's new network on the next round |
| A random IV for each request | GCM must never take the same IV twice under one key |
| `reuseAddr` on every platform, and `reusePort` on Linux | Home Assistant or tinytuya on the same host listens on the same ports. On Linux, a program that sets SO_REUSEPORT alone, as tinytuya does, shares its port only with another that sets it. Each broadcast reaches every listener, but the kernel gives an answer on port 7000 to one of them alone |
| A datagram that is not a device's broadcast is dropped, with no callback | The broadcast key is the same for every device, so unlike a dropped TCP frame it never means the caller's key is wrong: there is nothing for the caller to do |
| A port that cannot be bound rejects with `DISCOVERY_FAILED`, and is not retried | Another program holds it without sharing it. Whether to wait for it is the caller's decision |
| An error after the ports are bound, and a failed send, are ignored | A UDP socket has no connection to lose: an error costs one datagram, and a send to an interface that went away fails alone |
| `TuyaDiscovery` takes its two sockets and the function that lists where requests go | A test binds loopback sockets, so no request leaves the machine and no device on the LAN answers one |
