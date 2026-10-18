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
- `@open-tuya/core` holds the types and errors the others all use, and the
  two pieces both clouds share, `fetchJson` and `MqttSession`, so none of them
  depends on another: [MQTT](#mqtt) says why the session is there.

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
`scripts/importTuyaLocal.ts`, and the script runs again each time tuya-local
adds devices. A new device goes to tuya-local, so the two projects share one
catalog rather than splitting their contributors.

Each entry is a TypeScript file, `const entry: TuyaDeviceEntry = { … }`, so
`tsc` checks every entry against the type:

- Rejected: tuya-local's YAML as it is. It describes a device as Home
  Assistant entities, and nothing checks a YAML file against our types.
- Rejected: JSON. TypeScript widens a JSON string to `string`, so `tsc` cannot
  catch a wrong value such as an unknown data point type.
- Rejected: `satisfies TuyaDeviceEntry`. It checks as strictly, but `tsc` then
  writes each entry's whole literal type into its declaration file, which
  doubled the package.

| Choice | Why |
| --- | --- |
| A device's controls are grouped into components: a light, fan or climate entity is one, its other entities join the device's main one, and a device with no such entity has one named `device` | A control often repeats within a device: a backlight beside the light, a second valve. Matter's endpoints and HomeKit's services group the same way |
| A control's value is the device's own after tuya-local's mapping and scale, with the device's range and unit | Every caller rescales to its own target, HomeKit to percent and Matter to 1–254, so a catalog that rescaled would lose precision for nothing |
| A control's name carries its unit after `In`: `targetTemperatureInC`, `currentInMilliamps` | `AGENTS.md` names units so. A device that reports Fahrenheit has `targetTemperatureInF` |
| A temperature on a device that switches unit at runtime has no unit in its name, and names the control that holds it in `unitFrom` | 180 of 492 climate and water heater files read their unit from a data point |
| A climate entity's temperatures share one unit: the unit data point's, else the first temperature data point's, else Celsius | tuya-local resolves it so ([`climate.py`](https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/climate.py#L127-L156)) |
| A standard data point takes a name from the converter's table, such as `hvacMode` for climate's `hvac_mode`; any other takes tuya-local's own name, translation key or class, in camelCase | The table covers what tuya-local names alike across devices; a free-text name such as "Outlet temperature" already says what it controls |
| `CONTROL_NAMES` lists the names the catalog gives alike across devices, as a constant typed by its values; `KnownControlName` adds their unit suffixes | A caller's editor completes a known name, and `tsc` fails the converter if its table names one the list lacks. A catalog test fails once 20 entries share a name the list lacks, so the list follows each import |
| A name of a control's own stays a `string` | It comes from the device file's text, so no fixed list holds it |
| Every control has a `kind`, `switch`, `button`, `number`, `select`, `sensor`, `event` or `text`, and many say what they `measure` | A caller that meets a name it does not know handles the control by these: a button acts when written, where a switch toggles, though both take a boolean. `measures` turns tuya-local's class into the catalog's own words, so a free-form `poolTemperatureInC` still reads as a temperature |
| A device file is converted whole or left out, and the script lists those it leaves out in `UNSUPPORTED.md` with the feature they use | `AGENTS.md` forbids converting part of a device |
| The conversion takes tuya-local's mapping as `values`, `otherwise` and `whenAbsent`, its `scale`, `step`, `invert`, `range` and `target_range`, its `mask` and `format`, its `constraint` and `conditions`, and its `value_redirect` and `value_mirror` | 1,552 of 1,772 files use nothing more. `available`, one data point given two types, and `invalid` are the features most files left out use |
| A redirect or a mirror embeds the data point it reads, converted as a control is, and redirects again through it | 136 of the data points redirected to in tuya-local's files are hidden, so no control names them, and each converts its value its own way. A file whose redirects loop is left out |
| A redirected data point takes its own range and step, and the redirecting rule's where it has none | tuya-local shows the rule's range and step, and checks a write against the other data point's. In 119 of 133 redirecting conditions with a range the two agree; in 12 the other data point has none |
| The rule for an absent data point is `whenAbsent`, a rule like a mapping's, replacing `absent` | 96 redirects and mirrors in tuya-local's files are on that rule, which reads another data point while a firmware variant leaves its own out |
| A rule's or a condition's `range` becomes the range a write is checked against; `invert` and `targetRange` keep the control's | tuya-local checks a write against the rule's range, and inverts against the data point's ([`device_config.py`](https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L662-L681)). A range on a rule for one raw value keeps its file out: a mapped value takes none |
| A write redirected to a read-only data point throws `VALUE_UNAVAILABLE` | tuya-local writes nothing; the caller hears of it, as for a read-only constraint |
| `resolveControl` gives a control as the device's data points make it: the condition that holds applied, its redirect followed | A condition or a redirect changes a control's range, scale and step with the device's state, such as an eco target temperature's, which a caller shows |
| A condition is a `dependsOn` on the mapping or the control it changes, naming its constraint by data point | 145 of the 266 constraints in the files it converts are data points tuya-local hides, which have no control to name |
| A condition can give what its mapping rule can: a value, a nested mapping of values, `scale`, `step`, `invert` and `target_range` | tuya-local takes a condition as a mapping rule. A condition's `range`, `value_redirect`, `invalid` or `available` keeps its file out, under that feature |
| The last condition that holds applies; a write applies the first that gives the value written, and sets a constraint that can be written to the one value it names | tuya-local does ([`device_config.py`](https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L933-L976)): writing a vacuum's command `stop` sets its `activate` to false |
| A value that only a condition on a read-only constraint gives, while the condition does not hold, throws a `TuyaError` with code `VALUE_UNAVAILABLE` | It depends on what the device holds now, such as a mode it sets itself, so a caller handles it, where a `TypeError` or `RangeError` from `writeControls` is a mistake in the call. tuya-local writes nothing ([README](https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/devices/README.md#L505-L509)) |
| A file with conditions on the value while its data point is absent, or a constraint read through a mask or a mapping, is left out | `absent` takes one value, and tuya-local compares such a constraint by the value it reads, not its raw value. Each affects few files: `UNSUPPORTED.md` lists them |
| A `format` field becomes a control with a `mask` over the bytes it covers | A format packs fields one after another, big-endian, so each field is a mask over the value's bytes, and one conversion carries both |
| A colour field is named for what it drives: `hue`, `saturation`, `red`, `green`, `blue`, and `colorBrightness` for `v`, which is not the white `brightness` data point. A field tuya-local names without saying what it drives is `color` and its name, such as `colorWb` | HomeKit and Matter name hue and saturation so. A guess at what `wb` drives would be a guess |
| A masked switch or binary sensor with no mapping reads 0 as false, 1 as true, and any other value as true | tuya-local takes its value as truthy, and every other switch reads a boolean |
| A masked write keeps the other bits from the data point's current value, and `writeControls` takes the current data points to keep them from | tuya-local writes so; a device reads the whole value |
| A masked write to a value of another length than the mask throws a `RangeError` | tuya-local writes the mask's length, which drops or fails on the bytes of a longer value. A length the mask does not fit most likely means the device file does not fit the device, and a field written into the wrong bytes is worse than none. In tuya-local's files, 29 data points carry masks of different lengths, so a value longer than one of them; the one written is in a file left out for `constraint` |
| A device file with an odd-length mask on a control that can be written is left out | A hex value with an odd number of digits is padded to read it, and no source shows what a device takes back |
| Presentation is dropped: icons, translation keys, entity categories, `hidden` entities, `deprecated` entities, `available` flags, and data points tuya-local itself calls `unknown_…` | None changes what a value means or what may be written. A data point given no control stays in `dataPoints`, which matching reads |
| Lookup scores entries as tuya-local does: a product key match scores 101, and otherwise the share of reported data points the entry names | One product key appears in more than one file, so lookup returns candidates, best first |
| Each entry records the tuya-local commit that last changed its file | A run then changes only the entries whose files changed |
| `yaml` is a dev dependency of `@open-tuya/devices` | The script parses tuya-local's files with it. One file it rejects, as YAML 1.2 does, is listed in `UNSUPPORTED.md` rather than parsed by a laxer parser |

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

## Closing

`TuyaConnection`, every `TuyaClient`, `TuyaDiscovery` and
`SimulatedTuyaDevice` each hold sockets, and `close()` releases them.
`[Symbol.asyncDispose]` calls `close()`, so `await using` releases the object
at the end of its scope.

| Choice | Why |
| --- | --- |
| `close`, whatever made the object | Node names it so for every object that holds a socket or a file, whatever made it: `net.createServer`, `dgram.createSocket`, `fs.promises.open`. One verb that always means "released for good" serves a caller better than one paired with each factory |
| `close()` resolves once the sockets are released | A caller that binds the same port again, or exits, needs to know when it is free |
| Closing twice is safe | `await using` and a `close()` of the caller's own can both reach one object |
| `[Symbol.asyncDispose]` beside `close()` | `await using` releases the object even when its scope throws. Node's `net.Server`, `dgram.Socket` and `FileHandle` pair the two the same way |
| `TuyaClient` extends `AsyncDisposable` | A caller holding a client through the interface can use `await using` too. The type comes from `@types/node`, as TypeScript's `es2024` lib lacks it: a caller who compiles without `@types/node` adds `esnext.disposable` to `lib` |

Rejected: a `dispose()` method, which is not Node's name for it, and `stop()`
for a discovery, which says it could start again.

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
| `connected` on every client: a LAN client's while its connection is open, a cloud client's until it is closed | `RoutedTuyaClient` skips a route that would make a request wait to connect, and takes pushes from the first connected route. On the interface, a `RoutedTuyaClient` is itself a route |
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

## Cloud app sources

Every protocol fact in `@open-tuya/cloud-app` comes from
[tuya-device-sharing-sdk](https://github.com/tuya/tuya-device-sharing-sdk),
Tuya's own client for this API, or from responses captured in issues. These
count for nothing on the wire:

| Source | Why |
| --- | --- |
| home-assistant/core `components/tuya` | Calls the SDK, and adds only its client ID, schema and QR text |
| make-all/tuya-local | Its login is Home Assistant's, copied in [`8896547`](https://github.com/make-all/tuya-local/commit/8896547f6af5ea6f3252256e0dc94cc4e54aa983), and it calls the SDK |

## Cloud app requests

What `@open-tuya/cloud-app` does with each request is its own design.

| Choice | Why |
| --- | --- |
| A nonce of 12 characters drawn by `node:crypto` from the SDK's alphabet | AES-GCM must never take a nonce twice under one key, and the cloud reads the nonce from the payload. The SDK draws from Python's `random`, which is not built for keys; its alphabet is kept, as no source shows the cloud taking other bytes |
| The response's `sign` is ignored | The GCM tag already proves the result came under the request's key, and no source shows how `sign` is computed |
| 10 s for an answer, and no retry but the one below | The SDK's 60 s would hold a write for a minute. Whether to retry is the caller's decision |
| A token is refreshed a minute before it expires, measured on the local clock from when it arrived | The SDK measures from the cloud's clock against the local one, so clock skew moves its refresh |
| One refresh at a time, and a request refused after another one refreshed is sent again without refreshing | The refresh token works once: a second refresh in flight would spend one the first already spent |
| "sign invalid" or code 1010 refreshes once and sends again, then rejects with `SESSION_EXPIRED` | The cloud also answers "sign invalid" after a rate limit ([core#178266](https://github.com/home-assistant/core/issues/178266#issuecomment-5200735391)) and after a network fault ([core#178338](https://github.com/home-assistant/core/issues/178338)), not only for a dead session |
| No filter on repeated commands | The SDK drops a command repeated within 10 s without saying so, which a caller would read as a write that worked |
| `listDevices` lists one home's devices at a time | Users hit the cloud's rate limit ([core#178281](https://github.com/home-assistant/core/issues/178281#issuecomment-5201857057)) |

## Cloud app login

| Choice | Why |
| --- | --- |
| `clientId` and `schema` are required options | The only pair known to work is Home Assistant's, so a caller who passes it chooses to sign in as Home Assistant |
| `requestQrCode` and `waitForScan` are separate calls on one `QrLogin` | After `QR_CODE_EXPIRED` the caller requests a new QR code with the same login |
| `waitForScan` polls every 2 s until it succeeds, until `E0020002`, or until the signal aborts | Home Assistant and tuya-local check once when the user clicks, so no source shows what the cloud answers before the scan: every other answer has to mean "not yet". A scan is noticed within 2 s |
| `CloudAppSession` holds the endpoint, the tokens and the expiry alone | Nothing built needs the user ID or the terminal ID; logging out, which takes the terminal ID, is not built |

## Cloud app data points

`AppCloudTuyaClient` keys data points by ID with the device's own values, as
[Client](#client) decides. The cloud reads and writes them by code, and maps a
code to an ID through `dpStatusRelationDTOS`, each relation naming the
conversion the cloud applies to the device's value.

Chosen: a data point maps when its conversion is `"default"`, which hands the
value through unchanged, on a device whose every relation supports local and
which is not of a custom type. Any other data point is left out of a read, and
a write to it rejects with `UNMAPPED_DATA_POINT`. A push carries the device's
own values by ID, so it carries every data point.

- Rejected: keying the cloud client by code. A caller could not switch
  between the LAN and the cloud.
- Rejected: converting back what the other strategies convert. Each converts
  the device's value to the cloud's alone, such as `hb_range_v1` mapping a
  brightness of 25 to 255 onto 0 to 100, and tuya-local stopped trusting the
  cloud's model for its enums ([`934171a`](https://github.com/make-all/tuya-local/commit/934171ac822f4be6672d14c7e01a8265ec8188ac)).
  Inverting an `"enum"` mapping that is one-to-one could follow.

| Question | Chosen | For | Against |
| --- | --- | --- | --- |
| Which field of a relation names the code a command takes | `statusCode`. No capture shows it differ from `dpCode` | The SDK [`ae5e3c4`](https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13) | tuya-local [`c0e9a87`](https://github.com/make-all/tuya-local/commit/c0e9a876451e9c300de163eeea8e4fa7846c29d6) names a data point by `dpCode`, and sends no command |

## Cloud app push

| Choice | Why |
| --- | --- |
| One connection per account, through `MqttSession` | One set of credentials serves every device of the account |
| A device's topic is subscribed while it has a client | Each device has a topic of its own |
| A client subscribes when created | As `LocalTuyaClient` connects when created |
| No read after a reconnect, unlike `LocalTuyaClient` | Each read costs a request under the cloud's rate limit |

## MQTT

Both clouds push device updates over MQTT. MQTT.js speaks the protocol;
`MqttSession`, in `@open-tuya/core`, keeps a connection to a cloud's broker
while anything subscribes, and each cloud opens its connections through a thin
adapter over MQTT.js.

| Choice | Why |
| --- | --- |
| MQTT.js, not a client of our own | It is the mature Node client, and the subset push needs is all it would replace: `AGENTS.md` says to depend on such a library |
| `MqttSession` in `@open-tuya/core` | Both clouds renew and reconnect alike, and the session holds no byte layout and imports nothing from Node |
| The adapter over MQTT.js in each cloud, not in core | In core it would install MQTT.js for a caller of the LAN alone. It is under 90 lines |
| MQTT.js's defaults: MQTT 3.1.1, a clean session, a keep-alive of 60 s | Each cloud's sources connect with the same |
| `reconnectPeriod: 0` | MQTT.js would reconnect with a client ID gone stale once renewed ([`6d400c4`](https://github.com/tuya/tuya-device-sharing-sdk/commit/6d400c48b9a123599bd1b96024665adf72447783)); the session reconnects with fresh credentials |
| `aedes` is a dev dependency of each cloud | An MQTT broker written by others carries the clouds' push tests end to end |
| A session connects with its first subscription and closes with its last | Nothing holds a connection nobody listens on |
| A topic is named from each connection's credentials | The cloud app hands out its topic template with the credentials, and the developer platform its one topic |
| Each message comes with the credentials of its connection | The developer platform encrypts a message under its connection's password |
| Credentials are renewed 60 s before they expire, the new connection opened before the old one closes | A client ID goes stale once renewed, and no push is lost in between |
| After a loss, fresh credentials and a new connection 5 s later, doubling to 60 s; none after `SESSION_EXPIRED`, `PERMISSION_DENIED` or an error that is not a `TuyaError` | As `LocalTuyaClient`. None of those clears by waiting |

Rejected:

- A client of our own. It was 450 lines, and MQTT.js does the same.
- An `@open-tuya/mqtt` package. It would be a package to publish and version for 200 lines.

## Cloud developer sources

Tuya's own projects count twice where sources disagree:
tuya/tuya-connector-nodejs, tuya/tuya-connector, tuya/tuya-homebridge,
tuya/tuya-iot-python-sdk and tuya/tuya-openclaw-skills. tinytuya,
adrianjagielak/homebridge-tuya-plus, and xZetsubou/hass-localtuya for what it
added, count once. Captured requests and responses settle a tie. These count
for nothing:

| Source | Why |
| --- | --- |
| rospogrigio/localtuya | Its `cloud_api.py` is Tuya's sample code and tinytuya's string to sign |
| TuyaAPI/cli | Signs and sends through tuya-connector-nodejs |
| home-assistant/core, before 2024 | Calls tuya-iot-python-sdk |

The signing formula reproduces nine signatures captured with their secrets,
in [tinytuya#330](https://github.com/jasonacox/tinytuya/issues/330),
[tinytuya#346](https://github.com/jasonacox/tinytuya/issues/346) and
[tuya-home-assistant#55](https://github.com/tuya/tuya-home-assistant/issues/55):
one a POST with a body, two with a signed `Content-type` header, the rest with
neither. The tests use signatures computed by tinytuya's
and the SDK's own code instead, as the captured secrets are other people's.

| Question | Chosen | For | Against |
| --- | --- | --- | --- |
| A GET's body hash | The SHA-256 of nothing, with no body sent, two of Tuya's three against one. The cloud hashes the bytes it receives | tuya-homebridge [`95487cf`](https://github.com/tuya/tuya-homebridge/commit/95487cfbc51b8df682c96750bb26b3f4e1675f1c), the SDK [`b3243bf`](https://github.com/tuya/tuya-iot-python-sdk/commit/b3243bf51822307b3cc93b14c2c18eae36d8585b); tinytuya [`9bb3656`](https://github.com/jasonacox/tinytuya/commit/9bb3656e6421f28b785bc5bd967d1fbf3391338b); the captures | The connector [`9d42acb`](https://github.com/tuya/tuya-connector-nodejs/commit/9d42acb88625df663b140639298dce6f00241db4) hashes and sends `{}` |
| A nonce | None, two of Tuya's three against one | The connector, the SDK; tinytuya; the captures | tuya-homebridge [`95487cf`](https://github.com/tuya/tuya-homebridge/commit/95487cfbc51b8df682c96750bb26b3f4e1675f1c) signs one UUID for the life of the process |
| Signed headers | None, two of Tuya's three against one | The connector, the SDK | tuya-homebridge signs `client_id`; tinytuya signs `Content-type` on a POST |
| The query in the signature | Its keys sorted, its values unencoded, two of Tuya's three against one | The connector [`05c611c`](https://github.com/tuya/tuya-connector-nodejs/commit/05c611c4f38c89e1a6f9b38a560028162d783540), the SDK; tinytuya [`8393e6c`](https://github.com/jasonacox/tinytuya/commit/8393e6c71446feb92c4df77f7bd11af0ed1ab777) | tuya-homebridge signs it as written |
| A pushed message's additional data | `t` as decimal text, and the tag checked. Tuya's two projects tie, both from 2021-04-24; a client that checked tuya-homebridge's form dropped every real message, and dropped the check ([`fd6e195`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/fd6e195a1c4dda58b95c4a0673722ebed5449b10)) | The SDK [`f97d9ea`](https://github.com/tuya/tuya-iot-python-sdk/commit/f97d9ea73226efcac36eebf74b080c4d4738518e), which checks the tag, and on which Home Assistant ran for years | tuya-homebridge [`b530a71`](https://github.com/tuya/tuya-homebridge/commit/b530a71ae78afc9672c2ce42345749d38605f31c) writes `t` as 6 bytes and never checks the tag |

## Cloud developer requests

| Choice | Why |
| --- | --- |
| The caller names the data center, by tinytuya's code | A project reaches only the accounts in its own, and no request tells which that is |
| No session to persist | A project takes a token from its credentials whenever it needs one |
| A new `grant_type=1` token a minute before the last expires, and once on 1010, never `/v1.0/token/{refresh_token}` | Both requests are Tuya's: the connector refreshes on 1010 and takes a new token when that fails ([`e619df6`](https://github.com/tuya/tuya-connector-nodejs/commit/e619df60109ac4f06e9b44de7fa15bf4d1b24690)), signing the refresh the old way. Taking a new token at once skips that request, as tinytuya does ([`4e553ee`](https://github.com/jasonacox/tinytuya/commit/4e553eedaa279403278f0b402d2efbc9ece5a7a0)) |
| `listDevices()` lists every linked account's devices; `viaDeviceId` lists one account's | Some projects are refused the first with 1106, and tinytuya then lists through a known device ([tinytuya#330](https://github.com/jasonacox/tinytuya/issues/330)) |
| 1106, 1114, 2007 and the 2884 codes reject with `PERMISSION_DENIED` | The caller's fix for each is on the platform: renew the trial, authorize the API, or pick the data center |
| 1010 takes a new token and sends once more; a wrong secret rejects with `REQUEST_REJECTED` | A token lapses; a secret does not mend itself |
| 10 s for an answer, no other retry | As the cloud app |

## Cloud developer data points

`DeveloperCloudTuyaClient` reads and writes a device's data points through its
thing model, which keys them by ID with the device's own values, as
[Client](#client) decides.

| Choice | Why |
| --- | --- |
| Read `/v2.0/cloud/thing/{id}/shadow/properties` | It carries each `dp_id` and the device's own value ([`25424c5`](https://github.com/tuya/tuya-connector/commit/25424c594135e8c5f4c684a0b7cce8fc7b4fcca6)), as captured in [tinytuya#391](https://github.com/jasonacox/tinytuya/issues/391) and [hass-localtuya#782](https://github.com/xZetsubou/hass-localtuya/issues/782#issuecomment-3958114610) |
| Write `/v2.0/cloud/thing/{id}/shadow/properties/issue`, by the thing model's code | It addresses the properties the shadow reads, in the thing model's own terms: an integer before its scale ([`79292c5`](https://github.com/tuya/tuya-openclaw-skills/commit/79292c594cfba383555b4f465e835132136f0ea6)), as the device holds it |
| Map an ID to its code through `/v2.0/cloud/thing/{id}/model`, once per client | The model lists every property, where the shadow lists those with a value |
| Push hands on the value under each data point's ID, never `value` | `value` holds the cloud's converted value, such as `{"h":23,…}` where the device sent `001703de0017` ([tuya-home-assistant#591](https://github.com/tuya/tuya-home-assistant/issues/591)) |

Rejected: `/v1.0/iot-03/devices/{id}/status` and `/commands`, which most
sources use. They key data points by the standard instruction set's codes and
values, which the cloud converts from the device's for some data points and
does not say which.

## Cloud developer push

| Choice | Why |
| --- | --- |
| One connection per account, through `MqttSession`, on the project's one topic | Every device of the project is pushed on it |
| `msg_encrypted_version` 2.0 | AES-GCM, whose tag shows the message came under the connection's password |
| A message whose tag is wrong is dropped | Its bytes are not what the cloud sealed |

## Routes

`createTuyaClient` reaches one device over the routes the caller lists, in
their order, as a `RoutedTuyaClient`. Each choice below is the library's own.
homebridge-tuya-plus
([`d7bb418`](https://github.com/adrianjagielak/homebridge-tuya-plus/commit/d7bb418646dfda361e67a61cbc76debacb0a8b10))
and ioBroker.tuya are the open-source projects that route one device over the
LAN and a cloud. Both pick a route for each write by whether the LAN is
connected.

| Choice | Why |
| --- | --- |
| The caller passes the LAN's `host`, `version` and `localKey`; `createTuyaClient` runs no discovery and lists no cloud | Discovery binds UDP ports shared with other programs, and on Linux a 3.5 device's answer on port 7000 reaches one socket alone, so a discovery per client loses answers. A cloud list per client spends requests against the rate limit |
| Each request starts at the first route, and skips a route that is not connected unless it is the last | A request to a LAN client that is reconnecting waits up to 5 s for the attempt. Starting again at the first route returns to the LAN as soon as `LocalTuyaClient` reconnects |
| A read moves on to the next route after any failure | A read changes nothing |
| A write moves on only after `CONNECTION_FAILED`, `SESSION_KEY_NEGOTIATION_FAILED`, `RATE_LIMITED`, `SESSION_EXPIRED`, `PERMISSION_DENIED` or `UNMAPPED_DATA_POINT` | Each shows the route did not deliver the write. After a timeout or a lost connection the device may have taken it, and a button such as a feeder's `manualFeed` would act twice: ioBroker.tuya resends a write that timed out ([`main.js`](https://github.com/Apollon77/ioBroker.tuya/blob/dc8d799a9f292f573ec03ed994ab96a7ff7326f8/main.js#L467-L486)) |
| A request that failed on the one route it tried rejects with that route's error; one that failed on several rejects with `ROUTES_FAILED`, an `AggregateError` of their errors as its `cause` | One code cannot say both that the LAN key is wrong and that the cloud session expired, and the caller acts on each |
| Pushes come from the first route that is connected alone | A device reports each change over the LAN and to the cloud, the cloud's copy up to 5 s later (TuyaOpen [`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1), [`6b54585`](https://github.com/tuya/TuyaOpen/commit/6b5458586756d2e535b578ecc65a7fac35d30b12)). ioBroker.tuya drops the cloud's pushes while the LAN is connected the same way ([`main.js`](https://github.com/Apollon77/ioBroker.tuya/blob/dc8d799a9f292f573ec03ed994ab96a7ff7326f8/main.js#L2307)) |
| A cloud route's client is built again 5 s after a failed build, doubling to 60 s, but not after `SESSION_EXPIRED`, `PERMISSION_DENIED` or an error that is not a `TuyaError` | A cloud that is down at startup would otherwise leave the route dead, though the LAN reaches the device. As `MqttSession`, none of those clears by waiting |
| `createTuyaClient` reads the data points once through the routes, unless given `entry`, and finds the entry by them and the product key; when no route answers, by the product key alone | A product key is shared by several entries, and reused across products ([`f145f0e`](https://github.com/make-all/tuya-local/commit/f145f0ee2fcb39dc54bd992f8ab84895cc2b919e)): the data points' types rule some out. A device that is off still gets a client |
| The best entry is used; `entries` lists every candidate, and a caller passes the one it saved as `entry` | tuya-local lets the user pick once and keeps the pick |
| No entry leaves `entry` undefined, and the control methods throw `NO_CATALOG_ENTRY` | The data points of a device the catalog lacks can still be read and written |
| `onControls` reads the controls from the latest data points, and hands on those whose data point, or one they depend on or read instead, the push carries | A push carries some data points, and `readControls` would read the rest as absent. A control can depend on another data point: a change of unit changes how a temperature reads |
| No timeout of its own | Each route bounds its own requests |
| `close()` closes the clients it built, never the accounts | The caller made the account, and may share it between devices |
| It keeps the data points it last read, was pushed or wrote, and a masked control's write keeps the other bits from them, reading the device first when it has none | Reading before every such write would spend a request, and a cloud read just after a write can return the old value |
| `writeControls` calls run one at a time | HomeKit writes hue and saturation as two calls. Run together, each would keep the other's old value |

Rejected:

- Dropping a pushed value equal to the last one, as homebridge-tuya-plus does.
  A scene button pressed twice reports the same value twice.
- A route chosen once and kept until it fails. It would need a check to know
  when the LAN is back, which `LocalTuyaClient`'s own reconnecting already
  makes.
