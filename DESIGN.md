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

Where the sources disagree, `@open-tuya/local` takes what most of them do, and
the most recent change on a tie. Four count as independent:
[tinytuya](https://github.com/jasonacox/tinytuya),
[tuyapi](https://github.com/codetheweb/tuyapi),
[homebridge-tuya-lan](https://github.com/AMoo-Miki/homebridge-tuya-lan) and
[python-tuya](https://github.com/clach04/python-tuya), with
[hass-localtuya](https://github.com/xZetsubou/hass-localtuya) for the stream
handling it rewrote. These count for nothing:

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
| Whether a wrong CRC rejects a frame | It does, with `MALFORMED_FRAME`, against most sources: a frame is split at its length field, so a frame whose CRC is wrong may have been split at the wrong byte, and every frame after it with it. A wrong HMAC or tag rejects a 3.4 or 3.5 frame as well | tuyapi [`9ea40d7`](https://github.com/codetheweb/tuyapi/commit/9ea40d76dbc8721a174b427edf738d8f2f338c60) throws | tinytuya logs it and keeps the frame; homebridge-tuya-lan and python-tuya never check |
| Whether a wrong suffix rejects a frame | It does not | tinytuya logs it and keeps the frame; python-tuya never checks | tuyapi throws; homebridge-tuya-lan drops the frame |
| Where a frame ends | Where its length field says | hass-localtuya [`6d07160`](https://github.com/xZetsubou/hass-localtuya/commit/6d07160c4f3bc1addd19d44f49aed1c40635e7be), 2024; tinytuya | tuyapi [`98d4bf8`](https://github.com/codetheweb/tuyapi/commit/98d4bf8f3338e994bc60f307db850c9b54d2424c) and homebridge-tuya-lan, 2019, end it at the first `0000AA55`, which a ciphertext can hold |
| The largest length field | 1440 | tinytuya [`0f38679`](https://github.com/jasonacox/tinytuya/commit/0f38679d7972e446a3db854aa5eb50d8104ddd9d), 2026 | hass-localtuya takes 2000; tuyapi and homebridge-tuya-lan have no limit |
| Which received payloads lose the "3.3" header | One that starts with "3.3" | tinytuya [`ee995bf`](https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a); tuyapi [`ab5c85e`](https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db) | homebridge-tuya-lan searches the whole frame for "3.3"; python-tuya never strips it |
| A payload that does not decrypt | An error | tinytuya [`8528e03`](https://github.com/jasonacox/tinytuya/commit/8528e03565d6dbaeebad372903de0adcfd3d037c), 2022; python-tuya | tuyapi and homebridge-tuya-lan, 2019, read it as plaintext |

## Protocol 3.4 and 3.5

The rules of [Protocol 3.3](#protocol-33) hold, and so does the frame
splitting: a frame ends at its length field, and a frame from a device carries
a return code. Five projects implement 3.4 or 3.5 independently: tinytuya,
tuyapi, iRayanKhan/homebridge-tuya for 3.4, adrianjagielak/homebridge-tuya-plus
for 3.5, and hass-localtuya where it changed tinytuya's code. rospogrigio/localtuya's
3.4 code is tinytuya's.

| Question | Chosen | For | Against |
| --- | --- | --- | --- |
| Which commands go without the version header | `SESS_KEY_NEG_START`, `SESS_KEY_NEG_FINISH`, `HEART_BEAT`, `DP_QUERY`, `DP_QUERY_NEW` and `UPDATEDPS` | tinytuya [`0c68f4b`](https://github.com/jasonacox/tinytuya/commit/0c68f4b4d40c16fb82586a37afe43588116920e4), tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e), iRayanKhan [`ea1d903`](https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a) | tinytuya alone also skips `SESS_KEY_NEG_RESP` and `LAN_EXT_STREAM`, which a client does not send |
| Whether a frame from a 3.4 device always carries a return code | Always, as on 3.3: the two differ only for a frame without one, and no source shows a device that sends one | tinytuya [`a60ffc6`](https://github.com/jasonacox/tinytuya/commit/a60ffc61484b164f588e2e6685810cfbd262de8f) | tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e) keeps its 3.3 guess from the top 24 bits; iRayanKhan copies homebridge-tuya-lan's |
| Whether the first 4 bytes of a 3.5 plaintext are a return code | Always | tinytuya [`c2f3e24`](https://github.com/jasonacox/tinytuya/commit/c2f3e24d968c5d23ffd4e71956b46028563f422f), tuyapi [`96af23b`](https://github.com/codetheweb/tuyapi/commit/96af23b59f5dac4a10ef81afd8cc94e85b1ed6d9) | homebridge-tuya-plus [`e316a91`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86) takes them only when the whole plaintext is not JSON |
| Where a frame ends | At its length field, as on 3.3: a ciphertext, an HMAC or a tag can hold the suffix's bytes | tinytuya, hass-localtuya [`6d07160`](https://github.com/xZetsubou/hass-localtuya/commit/6d07160c4f3bc1addd19d44f49aed1c40635e7be) | tuyapi, iRayanKhan and homebridge-tuya-plus search for the suffix |
| A 3.4 frame whose HMAC is wrong | `DECRYPTION_FAILED` | tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e) and iRayanKhan [`ea1d903`](https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a) throw | tinytuya logs it and keeps the frame |
| A 3.5 frame whose tag is wrong | `DECRYPTION_FAILED` | tinytuya [`4d07864`](https://github.com/jasonacox/tinytuya/commit/4d0786400447bac9082930454c02264c038b5c6e), 2026, throws; homebridge-tuya-plus [`e316a91`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86), 2025, drops the frame | tuyapi hands on the undecrypted bytes |
| A session key reply whose HMAC is wrong | `SESSION_KEY_NEGOTIATION_FAILED` | tinytuya [`d0ee0be`](https://github.com/jasonacox/tinytuya/commit/d0ee0be3d0034bb9d8848dde6054d68d1102bf8b), tuyapi [`c2b5e48`](https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e) and iRayanKhan end the negotiation | rospogrigio/localtuya and hass-localtuya log it and go on |
