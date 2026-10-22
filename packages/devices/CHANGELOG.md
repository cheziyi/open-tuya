# @open-tuya/devices

## 0.1.2

### Patch Changes

- [#49](https://github.com/cheziyi/open-tuya/pull/49) [`902e444`](https://github.com/cheziyi/open-tuya/commit/902e444a8c99042fc90c89238cd5355413e85d1d) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update the catalog to tuya-local's device files at make-all/tuya-local@8b12d78.

## 0.1.1

### Patch Changes

- [#47](https://github.com/cheziyi/open-tuya/pull/47) [`43fd749`](https://github.com/cheziyi/open-tuya/commit/43fd74937c277cc9916a6a9882634d05a7a2e6c5) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update the catalog to tuya-local's device files at make-all/tuya-local@d51e586.

## 0.1.0

### Minor Changes

- [#45](https://github.com/cheziyi/open-tuya/pull/45) [`cd2adf7`](https://github.com/cheziyi/open-tuya/commit/cd2adf78cddd193aedd888107d7e68e9d09ecf73) Thanks [@cheziyi](https://github.com/cheziyi)! - Replace a catalog entry's `productKeys` with `products`, each with its `productKey`, `manufacturer`, `model` and `modelId`, and give each control the `category` and each sensor the `reading` tuya-local gives it. tuya-local renamed four device files, so their entries' `source.file` changed: `CT20W_pir_motion_detector.yaml` is `ct20w_motiondetector.yaml`, `tuya_smart_zigbee_door_sensor.yaml` is `mirabella_genio_doorsensor.yaml`, `setti_czajnik_kettle.yaml` is `setti_kt950w_kettle.yaml` and `ZC34T-03-3A_swing_arm_opener.yaml` is `zc34t033a_swingarmopener.yaml`.

## 0.0.4

### Patch Changes

- [#40](https://github.com/cheziyi/open-tuya/pull/40) [`3bf52fc`](https://github.com/cheziyi/open-tuya/commit/3bf52fcc0b53e16f934f176a060b9f8460132b27) Thanks [@cheziyi](https://github.com/cheziyi)! - Show a README on the package's npm page, with an example and links to the full documentation.
- Updated dependencies [[`3bf52fc`](https://github.com/cheziyi/open-tuya/commit/3bf52fcc0b53e16f934f176a060b9f8460132b27)]:
  - @open-tuya/core@0.1.1

## 0.0.3

### Patch Changes

- [#21](https://github.com/cheziyi/open-tuya/pull/21) [`0d3107b`](https://github.com/cheziyi/open-tuya/commit/0d3107b2be3c0fff45d85378aaacd4df0c2ce8e8) Thanks [@cheziyi](https://github.com/cheziyi)! - Convert tuya-local's `available` and `invalid`, adding 87 devices. A rule or a condition gains `availableWhile`, the data point that makes it apply, and a condition gains `invalid`, which leaves the control without a value and makes `writeControls` throw `VALUE_UNAVAILABLE` while it holds.

- [#30](https://github.com/cheziyi/open-tuya/pull/30) [`41f1a7d`](https://github.com/cheziyi/open-tuya/commit/41f1a7de13050f4cba81f66c1dd6fa8a1e33bac3) Thanks [@cheziyi](https://github.com/cheziyi)! - A binary sensor always reads `true` or `false`, as Home Assistant shows it: a raw value its device file does not map, such as a fault code, reads `true` rather than the raw value. A bitfield's mapping drops the rules whose raw value is not a number, such as a fault named `e01`, which never matched a value.

- [#16](https://github.com/cheziyi/open-tuya/pull/16) [`b745b95`](https://github.com/cheziyi/open-tuya/commit/b745b956689b5bbc05391f7dfd27ed0096696e3f) Thanks [@cheziyi](https://github.com/cheziyi)! - Add the device catalog: 1,038 devices converted from tuya-local, `findDeviceEntries` to find a device's entry by product key or data points, `readControls` and `writeControls` to read and write its data points by name, and `CONTROL_NAMES`, `CONTROL_KINDS` and `MEASURES` for what each control is.

- [#19](https://github.com/cheziyi/open-tuya/pull/19) [`383dfbc`](https://github.com/cheziyi/open-tuya/commit/383dfbcf89920c02fbb81da30b7eece66bb245f7) Thanks [@cheziyi](https://github.com/cheziyi)! - Convert tuya-local's `constraint` and `conditions`, adding 167 devices, mostly heaters, thermostats, heat pumps, vacuums and air conditioners. A mapping or a control gains `dependsOn`, the conditions another data point picks between; `writeControls` can set that data point too, and throws `VALUE_UNAVAILABLE` for a value it cannot set while that data point holds what it does; `listDependencies` lists the data points a control depends on.

- [#22](https://github.com/cheziyi/open-tuya/pull/22) [`2cd00eb`](https://github.com/cheziyi/open-tuya/commit/2cd00eb8b5690b444f12b43a2732163ef7a97dbd) Thanks [@cheziyi](https://github.com/cheziyi)! - Convert devices that read one data point as more than one type, and `utf16b64` text, adding 94 devices, mostly lights, cameras, pet feeders, doorbells and alarms. A data point gains `otherTypes`, a control reading it as another type gains `type`, and `findDeviceEntries` needs a reported value to fit every type.

- [#37](https://github.com/cheziyi/open-tuya/pull/37) [`c9ea055`](https://github.com/cheziyi/open-tuya/commit/c9ea055ab6d228e5190e36f1ece6f3b711073efe) Thanks [@cheziyi](https://github.com/cheziyi)! - Give a data point that two entities expose one control, as a climate's `temperatureUnit` in `C` and `F`, and tell apart two controls of one name by what they do, as `currentSettingInA` beside `currentInA`, `scheduleEnabled` beside `schedule`, or `device.on` beside `light.on`, with an ordinal, as `secondStatus`, only where nothing does. A temperature unit reads `C` and `F`, not `celsius`, `°C` or `c`. Writing a boolean's rule for any other raw value writes the boolean no mapping names, as `false` for `C` where `true` is `F`, and a value no rule takes follows the current raw value's redirect before it is refused.

- [#31](https://github.com/cheziyi/open-tuya/pull/31) [`667e37f`](https://github.com/cheziyi/open-tuya/commit/667e37f1710c1ee4650b71ee158912fdfbf441e1) Thanks [@cheziyi](https://github.com/cheziyi)! - Add 7 devices to the catalog, such as two robot vacuums, a pill dispenser and a three-phase energy meter. A condition can name the value a control reads while its data point is absent, as `whenAbsent`, and a dependency can match the value a masked or mapped data point converts to, as `constraint`.

- [#34](https://github.com/cheziyi/open-tuya/pull/34) [`e24dcbe`](https://github.com/cheziyi/open-tuya/commit/e24dcbe73c99c4eefd65605f1d0f8ace2c9ab77c) Thanks [@cheziyi](https://github.com/cheziyi)! - Read and write data points as tuya-local does: a data point the device leaves out reads by the control's own rule, a `null` value reads as none, a write finds its rule, rounds half to even, sets a constraint through the constraint's own rules and gives the raw value its data point's type, and a value the data point cannot hold throws a `TypeError`. `findDeviceEntries` takes `productKeys`.

- [#25](https://github.com/cheziyi/open-tuya/pull/25) [`c600a3f`](https://github.com/cheziyi/open-tuya/commit/c600a3fe9ba1310b2dc0b246eec8ec0d6b5b0233) Thanks [@cheziyi](https://github.com/cheziyi)! - Name controls in full words, with each unit after `In` and each phase named, such as `currentPhaseAInA`, `targetTemperatureInF` and `unlockTemporaryPassword`.

- [#18](https://github.com/cheziyi/open-tuya/pull/18) [`441eefa`](https://github.com/cheziyi/open-tuya/commit/441eefa5fe0d5f30d70dece609d3b463afa5b0ed) Thanks [@cheziyi](https://github.com/cheziyi)! - Convert tuya-local's `mask` and `format`, adding 134 devices: energy meters, EV chargers, breakers and colour lights. A control gains `mask`, `maskSigned` and `littleEndian`, a light's colour reads as `hue`, `saturation` and `colorBrightness`, and `writeControls` takes the device's current data points, which a masked control keeps the other bits of.

- [#20](https://github.com/cheziyi/open-tuya/pull/20) [`bf1e86e`](https://github.com/cheziyi/open-tuya/commit/bf1e86e6e0b5f9302e4bf75183b3fd3e116e5e85) Thanks [@cheziyi](https://github.com/cheziyi)! - Convert tuya-local's `value_redirect`, `value_mirror` and a rule's own `range`, adding 213 devices. A rule gains `redirect` and `mirror`, the data point it reads, and writes, instead; a condition gains `min` and `max`; a control's `whenAbsent` is the rule it reads by while the device leaves its data point out; `resolveControl` gives a control's range, scale and step as the device's data points make them.

- [#27](https://github.com/cheziyi/open-tuya/pull/27) [`8057a9d`](https://github.com/cheziyi/open-tuya/commit/8057a9d7afbe4b03791d8e8c3f8ca24bd417f6fd) Thanks [@cheziyi](https://github.com/cheziyi)! - Add 29 devices to the catalog, such as lock volumes, fan speeds and sirens. A siren's tone, a light's effect and colour mode, and a water heater's mode carry `defaultValue`, the value to write when a command needs the control set and names none.

- [#24](https://github.com/cheziyi/open-tuya/pull/24) [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19) Thanks [@cheziyi](https://github.com/cheziyi)! - Support Node 22.12 and later, down from 22.19.
- Updated dependencies [[`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`68bbe44`](https://github.com/cheziyi/open-tuya/commit/68bbe441e0e8642b300c0075e8d99e07055ec71f), [`15b8f24`](https://github.com/cheziyi/open-tuya/commit/15b8f24376372cdc45e457f26dec173b2c49ecdc), [`d7d5e08`](https://github.com/cheziyi/open-tuya/commit/d7d5e08edb24c7fcc482f829111a30c554ee45fc), [`e25e29d`](https://github.com/cheziyi/open-tuya/commit/e25e29d1ef9a48b13b36fd0ae1467b708b532873), [`bd7645b`](https://github.com/cheziyi/open-tuya/commit/bd7645b7e3406b714b3ba34ce475f8f928370b1d), [`2a126e7`](https://github.com/cheziyi/open-tuya/commit/2a126e73fbc0b8321258bed22b2cf5990a90d4ad), [`8e02172`](https://github.com/cheziyi/open-tuya/commit/8e02172f68bd03347ca25639f1fa19537314fcfd), [`383dfbc`](https://github.com/cheziyi/open-tuya/commit/383dfbcf89920c02fbb81da30b7eece66bb245f7), [`a0d7df1`](https://github.com/cheziyi/open-tuya/commit/a0d7df12f7680ceda44f208acfffd7d3bc1d5c19)]:
  - @open-tuya/core@0.1.0

## 0.0.2

### Patch Changes

- Updated dependencies [[`c1443d9`](https://github.com/cheziyi/open-tuya/commit/c1443d993e6178e6d03bc4bcc607fe5f264089f9), [`050676f`](https://github.com/cheziyi/open-tuya/commit/050676f6bb225c21e02ca4a0ccbe0923a18d0795), [`75d11fb`](https://github.com/cheziyi/open-tuya/commit/75d11fb6afcf79cff49b00b9b865c67456da3c1c), [`33b888e`](https://github.com/cheziyi/open-tuya/commit/33b888e8d65c74b2764c70ac71196fbbe0f3d77e)]:
  - @open-tuya/core@0.0.2

## 0.0.1

### Patch Changes

- [`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f) Thanks [@cheziyi](https://github.com/cheziyi)! - Publish an empty package from the release workflow, to set up trusted publishing. It exports nothing yet.
- Updated dependencies [[`76482aa`](https://github.com/cheziyi/open-tuya/commit/76482aa9f70dfa26b1e9a975efb430c31ce3761f)]:
  - @open-tuya/core@0.0.1
