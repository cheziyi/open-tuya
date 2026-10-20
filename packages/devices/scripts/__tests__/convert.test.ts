import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertDeviceFile } from "../convert.ts";

// smartplugv1.yaml, moes_bht002_thermostat_c.yaml and poolsana_heatpump.yaml
// are tuya-local's own device files, copied from
// https://github.com/make-all/tuya-local/tree/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/devices.
function fixture(file: string): string {
  return readFileSync(new URL(`fixtures/${file}`, import.meta.url), "utf8");
}

function entry(text: string) {
  const conversion = convertDeviceFile(text);
  if (!("entry" in conversion)) {
    throw new Error(`Not converted: ${conversion.unsupported}`);
  }
  return conversion.entry;
}

describe("convertDeviceFile", () => {
  it("converts a plug into its controls, named for what each controls", () => {
    expect(entry(fixture("smartplugv1.yaml"))).toEqual({
      name: "Energy monitoring smartplug",
      products: [
        { productKey: "37mnhia3pojleqfh", model: "SP111-A" },
        { productKey: "kOKEJBFoF9VNB5FR", model: "HYS-U1S-13A" },
        {
          productKey: "bWBb4e6BTZGie0Lv",
          manufacturer: "TopGreener",
          model: "TGWF115PRM",
        },
      ],
      dataPoints: {
        "1": { type: "boolean" },
        "2": { type: "integer" },
        "4": { type: "integer" },
        "5": { type: "integer" },
        "6": { type: "integer" },
        "7": { type: "boolean", optional: true },
      },
      components: {
        device: {
          on: { dataPoint: "1", kind: "switch" },
          voltageInV: {
            dataPoint: "6",
            kind: "sensor",
            measures: "voltage",
            reading: "instant",
            category: "diagnostic",
            readOnly: true,
            unit: "V",
            scale: 10,
          },
          currentInMilliamps: {
            dataPoint: "4",
            kind: "sensor",
            measures: "current",
            reading: "instant",
            category: "diagnostic",
            readOnly: true,
            unit: "mA",
          },
          powerInW: {
            dataPoint: "5",
            kind: "sensor",
            measures: "power",
            reading: "instant",
            category: "diagnostic",
            readOnly: true,
            unit: "W",
            scale: 10,
          },
          overcurrentAlarm: {
            dataPoint: "7",
            kind: "sensor",
            measures: "fault",
            category: "diagnostic",
            readOnly: true,
            whenAbsent: { value: false },
          },
          timerInSeconds: {
            dataPoint: "2",
            kind: "number",
            category: "config",
            unit: "s",
            min: 0,
            max: 86400,
          },
        },
      },
    });
  });

  it("names the feature that keeps a device out", () => {
    expect(convertDeviceFile(fixture("poolsana_heatpump.yaml"))).toEqual({
      unsupported: "not valid YAML",
    });
  });

  it("converts a mode that depends on another data point into conditions on it", () => {
    expect(
      entry(fixture("moes_bht002_thermostat_c.yaml")).components.climate
        ?.hvacMode,
    ).toEqual({
      dataPoint: "1",
      kind: "select",
      values: [
        { raw: false, value: "off" },
        {
          raw: true,
          dependsOn: {
            dataPoint: "4",
            conditions: [
              { when: ["0"], value: "auto" },
              { when: ["1"], value: "heat" },
            ],
          },
        },
      ],
    });
  });

  it.each([
    [
      "a number conversion on one raw value",
      "sensor",
      "        type: integer\n        name: sensor\n        mapping:\n          - dps_val: 1\n            scale: 10",
      "a number conversion on one raw value",
    ],
    [
      "a step on one raw value that is a number",
      "number",
      "        type: integer\n        name: value\n        mapping:\n          - dps_val: 1\n            value: 10\n            step: 10",
      "a number conversion on one raw value",
    ],
    [
      "a mask of an odd number of hex digits on a control that can be written",
      "switch",
      '        type: hex\n        name: switch\n        mask: "100"',
      "a `mask` of an odd number of hex digits on a control that can be written",
    ],
    [
      "a mask that is not a string of hex digits",
      "sensor",
      "        type: base64\n        name: sensor\n        mask: 1000",
      "a `mask` that is not a string of hex digits",
    ],
    [
      "a mask on a string",
      "sensor",
      "        type: string\n        name: sensor\n        mask: FF00",
      "`mask` on a data point that is not hex, base64 or an integer",
    ],
    [
      "a format outside a light",
      "sensor",
      "        type: hex\n        name: sensor\n        format:\n          - name: h\n            bytes: 2",
      "`format` outside a light",
    ],
    [
      "a format field of 3 bytes",
      "light",
      "        type: hex\n        name: rgbhsv\n        format:\n          - name: h\n            bytes: 3",
      "a `format` field of other than 1, 2 or 4 bytes",
    ],
    [
      "a redirect that loops",
      "sensor",
      "        type: integer\n        name: sensor\n        mapping:\n          - dps_val: null\n            value_redirect: other\n      - id: 2\n        type: integer\n        name: other\n        mapping:\n          - dps_val: null\n            value_redirect: sensor",
      "a `value_redirect` that loops",
    ],
    [
      "a constraint the entity lacks",
      "sensor",
      "        type: integer\n        name: sensor\n        mapping:\n          - dps_val: 1\n            constraint: mode\n            conditions:\n              - dps_val: a\n                value: 2",
      "a `constraint` the entity lacks",
    ],
    [
      "a range in a condition on one raw value",
      "sensor",
      "        type: integer\n        name: sensor\n        mapping:\n          - dps_val: 2\n            constraint: sensor\n            conditions:\n              - dps_val: 1\n                range:\n                  min: 0\n                  max: 5",
      "a mapping's own `range` on one raw value",
    ],
    [
      "a number conversion in a condition on one raw value",
      "sensor",
      "        type: integer\n        name: sensor\n        mapping:\n          - dps_val: 1\n            constraint: sensor\n            conditions:\n              - dps_val: 1\n                scale: 10",
      "a number conversion on one raw value",
    ],
  ])("keeps out a device with %s", (_name, entity, dp, reason) => {
    expect(
      convertDeviceFile(
        `name: Device\nentities:\n  - entity: ${entity}\n    dps:\n      - id: 1\n${dp}\n`,
      ),
    ).toEqual({ unsupported: reason });
  });

  it("drops a step on a raw value that is a string, which sizes a slider alone", () => {
    const { components } = entry(`name: Fan
entities:
  - entity: fan
    dps:
      - id: 3
        type: string
        name: speed
        mapping:
          - dps_val: level_1
            value: 50
            step: 50
          - dps_val: level_2
            value: 100
            step: 50
`);

    expect(components.fan?.speed).toEqual({
      dataPoint: "3",
      kind: "select",
      values: [
        { raw: "level_1", value: 50 },
        { raw: "level_2", value: 100 },
      ],
    });
  });

  it("gives a siren's tone the first default that is not hidden", () => {
    const { components } = entry(`name: Siren
entities:
  - entity: siren
    dps:
      - id: 1
        type: string
        name: tone
        mapping:
          - dps_val: normal
            value: "off"
          - dps_val: alarm_light
            value: light
            hidden: true
            default: true
          - dps_val: alarm_sound
            default: true
          - dps_val: alarm_sound_light
            value: sound+light
            default: true
`);

    expect(components.siren?.tone?.defaultValue).toBe("alarm_sound");
  });

  it("gives a water heater's mode the default of a condition, else its rule's value", () => {
    const file = (value: string) => `name: Water heater
entities:
  - entity: water_heater
    dps:
      - id: 1
        type: boolean
        name: operation_mode
        mapping:
          - dps_val: false
            value: "off"
          - dps_val: true
            value: heat
            constraint: work_mode
            conditions:
              - dps_val: "1"
                value: eco
              - dps_val: "2"
${value}                default: true
      - id: 2
        type: string
        name: work_mode
        hidden: true
`;

    expect(
      entry(file("                value: electric\n")).components.waterHeater
        ?.mode?.defaultValue,
    ).toBe("electric");
    expect(entry(file("")).components.waterHeater?.mode?.defaultValue).toBe(
      "heat",
    );
  });

  it.each([
    [
      "a string mapped in part",
      "string",
      '          - dps_val: "0"\n            value: false\n          - dps_val: "1"\n            value: true',
      {
        values: [
          { raw: "0", value: false },
          { raw: "1", value: true },
          { raw: "", value: false },
        ],
        whenAbsent: { value: null },
        otherwise: true,
      },
    ],
    [
      "a bitfield with one value mapped",
      "bitfield",
      "          - dps_val: 0\n            value: false",
      {
        values: [{ raw: 0, value: false }],
        whenAbsent: { value: null },
        otherwise: true,
      },
    ],
    [
      "an integer mapped to text",
      "integer",
      "          - dps_val: 1\n            value: low_water\n          - dps_val: 2\n            value: overflow",
      {
        values: [
          { raw: 1, value: true },
          { raw: 2, value: true },
          { raw: 0, value: false },
        ],
        whenAbsent: { value: null },
        otherwise: true,
      },
    ],
    [
      "a default rule's text",
      "integer",
      "          - dps_val: 0\n            value: false\n          - value: fault",
      { values: [{ raw: 0, value: false }], otherwise: true },
    ],
  ])(
    "reads a binary sensor on %s as a boolean, as Home Assistant reads its truthiness",
    (_name, type, mapping, conversion) => {
      const { components } = entry(`name: Sensor
entities:
  - entity: binary_sensor
    class: problem
    dps:
      - id: 1
        type: ${type}
        name: sensor
        mapping:
${mapping}
`);

      expect(components.device?.fault).toEqual({
        dataPoint: "1",
        kind: "sensor",
        measures: "fault",
        readOnly: true,
        ...conversion,
      });
    },
  );

  it("drops a bitfield's rule whose raw value is not a number, as it matches none", () => {
    const { components } = entry(`name: Pump
entities:
  - entity: sensor
    name: Fault
    dps:
      - id: 2
        type: bitfield
        name: sensor
        mapping:
          - dps_val: 0
            value: ok
          - dps_val: E001
            value: Abnormal input voltage
`);

    expect(components.device?.fault?.values).toEqual([{ raw: 0, value: "ok" }]);
  });

  it("drops a format on a string, which tuya-local never decodes", () => {
    const { components } = entry(`name: Light
entities:
  - entity: light
    dps:
      - id: 24
        type: string
        name: std_rgbhsv
        format:
          - name: h
            bytes: 2
`);

    expect(components.light?.standardRgbhsv).toEqual({
      dataPoint: "24",
      kind: "text",
    });
  });

  it("takes the last of several rules with no raw value, as tuya-local does", () => {
    const { components } = entry(`name: Heater
entities:
  - entity: climate
    dps:
      - id: 2
        type: integer
        name: temperature
        unit: C
        range:
          min: 5
          max: 35
        mapping:
          - constraint: preset_mode
            conditions:
              - dps_val: ANTIFROST
                range:
                  min: 7
                  max: 28
          - constraint: preset_mode
            conditions:
              - dps_val: ECONOMY
                range:
                  min: 4
                  max: 32
      - id: 4
        type: string
        name: preset_mode
`);

    expect(components.climate?.targetTemperatureInC?.dependsOn).toEqual({
      dataPoint: "4",
      conditions: [{ when: ["ECONOMY"], min: 4, max: 32 }],
    });
  });

  it("reads a condition's value for an absent data point into its whenAbsent", () => {
    const { components } = entry(`name: Vacuum
entities:
  - entity: vacuum
    dps:
      - id: 5
        type: string
        name: command
        mapping:
          - constraint: pause
            conditions:
              - dps_val: false
                mapping:
                  - dps_val: smart
                    value: smart
                  - dps_val: null
                    value: pause
                    hidden: true
      - id: 2
        type: boolean
        name: pause
`);

    expect(components.vacuum?.command?.dependsOn?.conditions).toEqual([
      {
        when: [false],
        values: [{ raw: "smart", value: "smart" }],
        whenAbsent: { value: "pause" },
      },
    ]);
  });

  it("embeds a masked constraint's conversion, which the conditions match", () => {
    const { components } = entry(`name: Sensor
entities:
  - entity: sensor
    dps:
      - id: 1
        type: base64
        name: sensor
        mask: "00FF"
      - id: 2
        type: boolean
        name: probe_present
        mapping:
          - value: true
            constraint: sensor
            conditions:
              - dps_val: 255
                value: false
`);

    expect(components.device?.sensorProbePresent?.otherwise).toBe(true);
    expect(components.device?.sensorProbePresent?.dependsOn).toEqual({
      dataPoint: "1",
      constraint: { dataPoint: "1", mask: "00FF" },
      readOnly: true,
      conditions: [{ when: [255], value: false }],
    });
  });

  it("keeps out a device whose constraint read through a mask can be written", () => {
    expect(
      convertDeviceFile(`name: Switch
entities:
  - entity: switch
    dps:
      - id: 1
        type: base64
        name: mode
        mask: "00FF"
      - id: 2
        type: boolean
        name: switch
        mapping:
          - constraint: mode
            conditions:
              - dps_val: 1
                value: true
`),
    ).toEqual({
      unsupported:
        "a `constraint` read through a mask or a mapping that can be written",
    });
  });

  it("leaves a binary sensor on a boolean as it is", () => {
    const { components } = entry(`name: Sensor
entities:
  - entity: binary_sensor
    class: problem
    dps:
      - id: 1
        type: boolean
        name: sensor
`);

    expect(components.device?.fault).toEqual({
      dataPoint: "1",
      kind: "sensor",
      measures: "fault",
      readOnly: true,
    });
  });

  it("lists each product a key is sold as, with its model's code", () => {
    const { products } = entry(`name: Ceiling fan light
products:
  - id: ujya7f5twjovh1kf
    manufacturer: Lumary
    model: A1
    model_id: L-CFL18A1
  - id: ujya7f5twjovh1kf
    manufacturer: Serene
  - manufacturer: Unknown
entities:
  - entity: switch
    dps:
      - id: 1
        type: boolean
        name: switch
`);

    expect(products).toEqual([
      {
        productKey: "ujya7f5twjovh1kf",
        manufacturer: "Lumary",
        model: "A1",
        modelId: "L-CFL18A1",
      },
      { productKey: "ujya7f5twjovh1kf", manufacturer: "Serene" },
    ]);
  });

  it("gives an energy meter's total its reading, and each of an entity's controls its category", () => {
    const { components } = entry(`name: Meter
entities:
  - entity: sensor
    class: energy
    category: diagnostic
    dps:
      - id: 1
        type: integer
        name: sensor
        class: total_increasing
        unit: kWh
      - id: 2
        type: integer
        name: today
`);

    expect(components.device).toEqual({
      energyInKwh: {
        dataPoint: "1",
        kind: "sensor",
        measures: "energy",
        reading: "risingTotal",
        category: "diagnostic",
        readOnly: true,
        unit: "kWh",
      },
      energyToday: {
        dataPoint: "2",
        kind: "sensor",
        category: "diagnostic",
        readOnly: true,
      },
    });
  });

  it("drops a default on an entity that never writes it", () => {
    const { components } = entry(`name: Select
entities:
  - entity: select
    dps:
      - id: 1
        type: string
        name: option
        mapping:
          - dps_val: "0"
            value: Steady
            default: true
          - dps_val: "1"
            value: Flash
`);

    expect(components.device?.select).toEqual({
      dataPoint: "1",
      kind: "select",
      values: [
        { raw: "0", value: "Steady" },
        { raw: "1", value: "Flash" },
      ],
    });
  });

  it("converts conditions on a control's own conversion, with lists, hidden values and nested mappings", () => {
    const { components } = entry(`name: Thermostat
entities:
  - entity: climate
    dps:
      - id: 2
        type: integer
        name: temperature
        unit: C
        mapping:
          - scale: 10
            constraint: temperature_unit
            conditions:
              - dps_val: f
                scale: 1
                step: 10
      - id: 3
        type: string
        name: temperature_unit
        hidden: true
        readonly: true
      - id: 4
        type: string
        name: preset_mode
        mapping:
          - constraint: temperature_unit
            conditions:
              - dps_val: [c, C]
                mapping:
                  - dps_val: low
                    value: eco
              - dps_val: f
                value: comfort
                hidden: true
              - value: away
`);
    expect(components.climate?.targetTemperature).toMatchObject({
      dataPoint: "2",
      scale: 10,
      dependsOn: {
        dataPoint: "3",
        readOnly: true,
        conditions: [{ when: ["f"], scale: 1, step: 10 }],
      },
    });
    expect(components.climate?.preset?.dependsOn).toEqual({
      dataPoint: "3",
      readOnly: true,
      conditions: [
        { when: ["c", "C"], values: [{ raw: "low", value: "eco" }] },
        { when: ["f"], value: "comfort", readOnly: true },
        { when: [], value: "away" },
      ],
    });
  });

  it("names controls in full words, with each unit after In and each phase named", () => {
    const { components } = entry(`name: Meter
entities:
  - entity: climate
    dps:
      - id: 1
        type: integer
        name: temperature
      - id: 2
        type: integer
        name: temp_set_f
      - id: 3
        type: integer
        name: temp_cur_f
      - id: 4
        type: integer
        name: current_temperature_in_c
      - id: 5
        type: integer
        name: std_color_temp
  - entity: sensor
    translation_key: current_x
    translation_placeholders:
      x: A
    dps:
      - id: 6
        type: integer
        name: sensor
        unit: A
      - id: 7
        type: integer
        name: alt
  - entity: sensor
    name: UV index
    dps:
      - id: 8
        type: integer
        name: sensor
        unit: UV index
  - entity: number
    name: Time hours
    dps:
      - id: 9
        type: integer
        name: value
        unit: h
  - entity: number
    name: Unlock temp pwd
    dps:
      - id: 10
        type: integer
        name: value
  - entity: number
    name: Battery ch1
    dps:
      - id: 11
        type: integer
        name: value
`);
    expect(Object.keys(components.climate ?? {})).toEqual([
      "targetTemperatureInC",
      "targetTemperatureInF",
      "currentTemperatureInF",
      "currentTemperatureInC",
      "standardColorTemperature",
      "currentPhaseAInA",
      "currentPhaseAAlt",
      "uvIndex",
      "timeInHours",
      "unlockTemporaryPassword",
      "batteryChannel1",
    ]);
  });

  it("gives a data point read as two types both, and a control the type it reads", () => {
    const converted = entry(`name: Light
entities:
  - entity: select
    translation_key: scene
    dps:
      - id: 25
        type: string
        name: option
        mapping:
          - dps_val: "000e0d00"
            value: night
  - entity: text
    name: Scene data
    dps:
      - id: 25
        type: base64
        name: value
  - entity: event
    name: Message
    dps:
      - id: 26
        type: utf16b64
        name: event
`);
    expect(converted.dataPoints).toEqual({
      "25": { type: "string", otherTypes: ["base64"] },
      "26": { type: "utf16b64" },
    });
    expect(converted.components.device?.scene).not.toHaveProperty("type");
    expect(converted.components.device?.sceneData).toMatchObject({
      dataPoint: "25",
      type: "base64",
    });
  });

  it("converts availability and invalid conditions, and drops what tuya-local ignores", () => {
    const { components } = entry(`name: Dehumidifier
entities:
  - entity: select
    name: Speed
    dps:
      - id: 2
        type: string
        name: option
        mapping:
          - dps_val: "4"
            value: turbo
            available: is_pro
          - dps_val: "4"
            value: boost
            available: is_missing
            invalid: true
          - constraint: mode
            conditions:
              - dps_val: laundry
                invalid: true
      - id: 1
        type: string
        name: mode
        hidden: true
      - id: 3
        type: boolean
        name: is_pro
        hidden: true
`);
    expect(components.device?.speed).toEqual({
      dataPoint: "2",
      kind: "select",
      values: [
        { raw: "4", value: "turbo", availableWhile: { dataPoint: "3" } },
        { raw: "4", value: "boost" },
      ],
      dependsOn: {
        dataPoint: "1",
        conditions: [{ when: ["laundry"], invalid: true }],
      },
    });
  });

  it("embeds the data point a value redirects or mirrors to, as it converts", () => {
    const { components } = entry(`name: Heater
entities:
  - entity: climate
    dps:
      - id: 2
        type: integer
        name: temperature
        unit: C
        mapping:
          - scale: 10
            step: 5
            range:
              min: 50
              max: 300
            constraint: preset_mode
            conditions:
              - dps_val: eco
                value_redirect: eco_temperature
                step: 10
                range:
                  min: 50
                  max: 160
      - id: 3
        type: integer
        name: eco_temperature
        hidden: true
        mapping:
          - scale: 10
      - id: 4
        type: string
        name: preset_mode
      - id: 5
        type: integer
        name: current_temperature
        mapping:
          - dps_val: null
            value_mirror: temperature
`);
    expect(components.climate?.targetTemperatureInC).toEqual({
      dataPoint: "2",
      kind: "number",
      measures: "temperature",
      unit: "C",
      min: 50,
      max: 300,
      scale: 10,
      step: 5,
      dependsOn: {
        dataPoint: "4",
        conditions: [
          {
            when: ["eco"],
            step: 10,
            min: 50,
            max: 160,
            redirect: {
              dataPoint: "3",
              scale: 10,
              min: 50,
              max: 160,
            },
          },
        ],
      },
    });
    expect(components.climate?.currentTemperatureInC?.whenAbsent).toMatchObject(
      { mirror: { dataPoint: "2", scale: 10, min: 50, max: 300 } },
    );
  });

  it("gives a masked data point's controls their bits, and reads a masked switch as a boolean", () => {
    const { components } = entry(`name: Meter
entities:
  - entity: switch
    dps:
      - id: 1
        type: base64
        name: switch
        mask: "00FF"
  - entity: sensor
    class: current
    dps:
      - id: 2
        type: base64
        name: sensor
        unit: A
        mask: "FFFF0000"
        mask_signed: true
        endianness: little
        mapping:
          - scale: 1000
  - entity: number
    name: Limit
    dps:
      - id: 2
        type: base64
        name: value
        mask: "0000FFFF"
`);
    expect(components.device).toEqual({
      on: {
        dataPoint: "1",
        mask: "00FF",
        kind: "switch",
        values: [
          { raw: 0, value: false },
          { raw: 1, value: true },
        ],
        whenAbsent: { value: null },
        otherwise: true,
      },
      currentInA: {
        dataPoint: "2",
        mask: "FFFF0000",
        maskSigned: true,
        littleEndian: true,
        kind: "sensor",
        measures: "current",
        readOnly: true,
        unit: "A",
        scale: 1000,
      },
      limit: { dataPoint: "2", mask: "0000FFFF", kind: "number" },
    });
  });

  it("gives each field of a light's colour a control over its bytes", () => {
    const { components } = entry(`name: Bulb
entities:
  - entity: light
    dps:
      - id: 24
        type: hex
        name: rgbhsv
        format:
          - name: h
            bytes: 2
            range:
              min: 0
              max: 360
          - name: s
            bytes: 2
            range:
              min: 0
              max: 1000
          - name: wb
      - id: 25
        type: base64
        name: std_rgbhsv
        format:
          - name: v
`);
    expect(components.light).toEqual({
      hue: {
        dataPoint: "24",
        mask: "FFFF000000",
        kind: "number",
        min: 0,
        max: 360,
      },
      saturation: {
        dataPoint: "24",
        mask: "0000FFFF00",
        kind: "number",
        min: 0,
        max: 1000,
      },
      colorWb: {
        dataPoint: "24",
        mask: "00000000FF",
        kind: "number",
        min: 0,
        max: 255,
      },
      standardRgbhsvColorBrightness: {
        dataPoint: "25",
        mask: "FF",
        kind: "number",
        min: 0,
        max: 255,
      },
    });
  });

  it("gives a climate device that switches unit at runtime unit-less temperatures", () => {
    const { components } = entry(`name: Heater
entities:
  - entity: climate
    dps:
      - id: 2
        type: integer
        name: temperature
        unit: C
      - id: 3
        type: integer
        name: current_temperature
      - id: 9
        type: string
        name: temperature_unit
`);

    expect(components.climate).toEqual({
      targetTemperature: {
        dataPoint: "2",
        kind: "number",
        measures: "temperature",
        unit: "C",
        unitFrom: "temperatureUnit",
      },
      currentTemperature: {
        dataPoint: "3",
        kind: "sensor",
        measures: "temperature",
        readOnly: true,
        unitFrom: "temperatureUnit",
      },
      temperatureUnit: { dataPoint: "9", kind: "text" },
    });
  });

  it("gives a climate device's temperatures the unit one names, or Celsius", () => {
    const named = entry(`name: Heater
entities:
  - entity: climate
    dps:
      - id: 2
        type: integer
        name: temperature
        unit: F
      - id: 3
        type: integer
        name: current_temperature
`);
    const unnamed = entry(`name: Heater
entities:
  - entity: climate
    dps:
      - id: 3
        type: integer
        name: current_temperature
`);

    expect(Object.keys(named.components.climate ?? {})).toEqual([
      "targetTemperatureInF",
      "currentTemperatureInF",
    ]);
    expect(Object.keys(unnamed.components.climate ?? {})).toEqual([
      "currentTemperatureInC",
    ]);
  });

  it("reads a light's colour temperature in kelvin through its target range", () => {
    const { components } = entry(`name: Light
entities:
  - entity: light
    dps:
      - id: 20
        type: boolean
        name: switch
      - id: 23
        type: integer
        name: color_temp
        range:
          min: 0
          max: 1000
        mapping:
          - target_range:
              min: 2700
              max: 6500
`);

    expect(components.light).toEqual({
      on: { dataPoint: "20", kind: "switch" },
      colorTemperatureInK: {
        dataPoint: "23",
        kind: "number",
        unit: "K",
        min: 0,
        max: 1000,
        targetRange: { min: 2700, max: 6500 },
      },
    });
  });

  it("names each part of a device, and the data points in it", () => {
    const { components } = entry(`name: Fan light
entities:
  - entity: light
    dps:
      - id: 20
        type: boolean
        name: switch
  - entity: fan
    translation_key: fan_with_presets
    dps:
      - id: 60
        type: boolean
        name: switch
  - entity: valve
    translation_key: valve_x
    translation_placeholders:
      x: "1"
    dps:
      - id: 1
        type: boolean
        name: valve
  - entity: light
    translation_key: backlight
    dps:
      - id: 30
        type: boolean
        name: switch
  - entity: lock
    translation_key: child_lock
    dps:
      - id: 7
        type: boolean
        name: lock
  - entity: binary_sensor
    class: problem
    dps:
      - id: 11
        type: bitfield
        name: sensor
      - id: 11
        type: bitfield
        name: fault_code
  - entity: sensor
    name: Water flow
    dps:
      - id: 12
        type: integer
        name: sensor
        unit: L/min
      - id: 13
        type: integer
        name: unknown_13
      - id: 14
        type: boolean
        name: helper
        hidden: true
  - entity: switch
    deprecated: the light
    dps:
      - id: 20
        type: boolean
        name: switch
`);

    expect(components).toEqual({
      light: {
        on: { dataPoint: "20", kind: "switch" },
        childLock: { dataPoint: "7", kind: "switch" },
        fault: {
          dataPoint: "11",
          kind: "sensor",
          measures: "fault",
          readOnly: true,
          values: [{ raw: 0, value: false }],
          whenAbsent: { value: null },
          otherwise: true,
        },
        faultCode: { dataPoint: "11", kind: "sensor", readOnly: true },
        waterFlowInLPerMin: {
          dataPoint: "12",
          kind: "sensor",
          readOnly: true,
          unit: "L/min",
        },
      },
      fan: { on: { dataPoint: "60", kind: "switch" } },
      valve1: { open: { dataPoint: "1", kind: "switch" } },
      backlight: { on: { dataPoint: "30", kind: "switch" } },
    });
  });

  it("keeps a data point it gives no control in the data points it matches by", () => {
    const { dataPoints } = entry(`name: Sensor
entities:
  - entity: sensor
    dps:
      - id: 1
        type: integer
        name: sensor
      - id: 2
        type: integer
        name: unknown_2
        optional: true
`);

    expect(dataPoints).toEqual({
      "1": { type: "integer" },
      "2": { type: "integer", optional: true },
    });
  });

  it("converts a mapping into raw values, the rest, and the value while absent", () => {
    const { components } = entry(`name: Sensor
entities:
  - entity: select
    translation_key: mode
    dps:
      - id: 4
        type: string
        name: option
        mapping:
          - dps_val: null
            value: eco
          - dps_val: low
            value: eco
          - dps_val: high
            value: boost
          - dps_val: af
            value: away
            hidden: true
  - entity: number
    translation_key: target
    dps:
      - id: 5
        type: integer
        name: value
        range:
          min: 0
          max: 100
        mapping:
          - scale: 2
            step: 5
            invert: true
`);

    expect(components.device).toEqual({
      mode: {
        dataPoint: "4",
        kind: "select",
        values: [
          { raw: "low", value: "eco" },
          { raw: "high", value: "boost" },
          { raw: "af", value: "away", readOnly: true },
        ],
        whenAbsent: { value: "eco" },
      },
      target: {
        dataPoint: "5",
        kind: "number",
        min: 0,
        max: 100,
        scale: 2,
        step: 5,
        invert: true,
      },
    });
  });
});

describe("convertDeviceFile as tuya-local reads a file", () => {
  it("reads YAML as PyYAML reads YAML 1.1", () => {
    const { components } = entry(`name: Thermostat
entities:
  - entity: select
    translation_key: program
    dps:
      - id: 1
        type: string
        name: option
        mapping:
          - dps_val: 5_2
            value: weekdays
          - dps_val: y
            value: yes
          - dps_val: E1
            value: 1.5e+3
`);

    expect(components.device?.program?.values).toEqual([
      { raw: "52", value: "weekdays" },
      { raw: "y", value: true },
      { raw: "E1", value: 1500 },
    ]);
  });

  it("keeps an integer too large for a number whole, as the text a string data point takes", () => {
    const { components } = entry(`name: Light
entities:
  - entity: select
    translation_key: scene
    dps:
      - id: 25
        type: string
        name: option
        mapping:
          - dps_val: 80000000000000000000000000000000
            value: movie
`);

    expect(components.device?.scene?.values).toEqual([
      { raw: "80000000000000000000000000000000", value: "movie" },
    ]);
  });

  it("keeps a null value, a mapping with no value, and a hidden rule with no dps_val", () => {
    const { components } = entry(`name: Sensor
entities:
  - entity: sensor
    dps:
      - id: 1
        type: string
        name: sensor
        mapping:
          - dps_val: ""
            value: null
          - dps_val: keypad
          - value: normal
            hidden: true
`);

    expect(components.device?.sensor).toEqual({
      dataPoint: "1",
      kind: "sensor",
      readOnly: true,
      values: [{ raw: "", value: null }, { raw: "keypad" }],
      otherwise: "normal",
      ownRuleReadOnly: true,
    });
  });

  it("gives a control the last data point of its name in an entity, and a lock's jammed none to write", () => {
    const { components } = entry(`name: Lock
entities:
  - entity: lock
    dps:
      - id: 1
        type: boolean
        name: lock
      - id: 21
        type: string
        name: event
      - id: 26
        type: string
        name: event
      - id: 30
        type: boolean
        name: jammed
`);

    expect(components.lock).toEqual({
      locked: { dataPoint: "1", kind: "switch" },
      event: { dataPoint: "26", kind: "text" },
      jammed: { dataPoint: "30", kind: "sensor", readOnly: true },
    });
  });

  it("reads masked bits as signed on bytes alone", () => {
    const { components } = entry(`name: Meter
entities:
  - entity: sensor
    dps:
      - id: 1
        type: integer
        name: sensor
        mask: "FF00"
        mask_signed: true
`);

    expect(components.device?.sensor).toEqual({
      dataPoint: "1",
      mask: "FF00",
      kind: "sensor",
      readOnly: true,
    });
  });
});

describe("convertDeviceFile names", () => {
  it("puts each translation placeholder's value in the name", () => {
    const { components } = entry(`name: Breaker
entities:
  - entity: number
    translation_key: sensor_threshold
    translation_placeholders:
      sensor: Overvoltage
    dps:
      - id: 1
        type: integer
        name: value
        unit: V
  - entity: number
    translation_key: alarm_x_time
    translation_placeholders:
      x: 1
    dps:
      - id: 2
        type: integer
        name: value
        unit: h
  - entity: switch
    translation_key: outlet
    translation_placeholders:
      x: 2
    dps:
      - id: 3
        type: boolean
        name: switch
`);

    expect(Object.keys(components.device ?? {})).toEqual([
      "overvoltageThresholdInV",
      "alarm1TimeInHours",
      "outlet2",
    ]);
  });

  it("names a second control of a name with an ordinal, a count without a unit, a unit once, and a flow's ends inlet and outlet", () => {
    const { components } = entry(`name: Purifier
entities:
  - entity: sensor
    class: current
    dps:
      - id: 1
        type: integer
        name: sensor
        unit: A
  - entity: sensor
    class: current
    dps:
      - id: 2
        type: integer
        name: sensor
        unit: A
  - entity: sensor
    name: Uses today
    dps:
      - id: 3
        type: integer
        name: sensor
        unit: times
  - entity: sensor
    name: TDS in
    dps:
      - id: 4
        type: integer
        name: sensor
        unit: ppm
  - entity: sensor
    name: TDS out
    dps:
      - id: 6
        type: integer
        name: sensor
        unit: ppm
  - entity: number
    name: Pump cleaning in
    dps:
      - id: 7
        type: integer
        name: value
        unit: min
  - entity: button
    name: Zoom in
    dps:
      - id: 8
        type: boolean
        name: button
  - entity: button
    name: Zoom out
    dps:
      - id: 9
        type: boolean
        name: button
  - entity: sensor
    name: Temperature in C
    dps:
      - id: 5
        type: integer
        name: sensor
        unit: C
`);

    expect(Object.keys(components.device ?? {})).toEqual([
      "currentInA",
      "secondCurrentInA",
      "usesToday",
      "tdsInletInPpm",
      "tdsOutletInPpm",
      "pumpCleaningInMinutes",
      "zoomIn",
      "zoomOut",
      "temperatureInC",
    ]);
  });

  it("names a fan's preset as a climate's, and what a class detects in the catalog's words", () => {
    const { components } = entry(`name: Fan
entities:
  - entity: fan
    dps:
      - id: 1
        type: boolean
        name: switch
      - id: 2
        type: string
        name: preset_mode
  - entity: binary_sensor
    class: safety
    dps:
      - id: 3
        type: boolean
        name: sensor
`);

    expect(Object.keys(components.fan ?? {})).toEqual([
      "on",
      "preset",
      "safety",
    ]);
    expect(components.fan?.safety?.measures).toBe("hazard");
  });

  it("gives a data point two entities expose one control, the climate's over a select", () => {
    const { components } = entry(`name: Heater
entities:
  - entity: climate
    dps:
      - id: 2
        type: integer
        name: temperature
      - id: 19
        type: string
        name: temperature_unit
        mapping:
          - dps_val: c
            value: C
          - dps_val: f
            value: F
  - entity: select
    translation_key: temperature_unit
    dps:
      - id: 19
        type: string
        name: option
        mapping:
          - dps_val: c
            value: celsius
          - dps_val: f
            value: fahrenheit
`);

    expect(components).toEqual({
      climate: {
        targetTemperature: {
          dataPoint: "2",
          kind: "number",
          measures: "temperature",
          unitFrom: "temperatureUnit",
        },
        temperatureUnit: {
          dataPoint: "19",
          kind: "select",
          values: [
            { raw: "c", value: "C" },
            { raw: "f", value: "F" },
          ],
        },
      },
    });
  });

  it("gives a sensor's unit the writes of a select on its data point, in the unit's values", () => {
    const { components } = entry(`name: Thermometer
entities:
  - entity: select
    translation_key: temperature_unit
    dps:
      - id: 9
        type: string
        name: option
        mapping:
          - dps_val: c
            value: celsius
          - dps_val: f
            value: fahrenheit
  - entity: sensor
    class: temperature
    dps:
      - id: 1
        type: integer
        name: sensor
      - id: 9
        type: string
        name: unit
        mapping:
          - dps_val: f
            value: F
          - dps_val: k
            value: K
          - value: C
`);

    expect(components.device?.temperatureUnit).toEqual({
      dataPoint: "9",
      kind: "select",
      values: [
        { raw: "f", value: "F" },
        { raw: "k", value: "K", readOnly: true },
        { raw: "c", value: "C" },
      ],
      otherwise: "C",
      ownRuleReadOnly: true,
    });
    expect(Object.keys(components.device ?? {})).toEqual([
      "temperatureUnit",
      "temperature",
    ]);
  });

  it("keeps an entity's own data point over another's attribute on it, and takes no writes from the attribute", () => {
    const { components } = entry(`name: Water heater
entities:
  - entity: water_heater
    dps:
      - id: 1
        type: string
        name: operation_mode
      - id: 21
        type: integer
        name: inlet_temperature
  - entity: sensor
    translation_key: inlet_temperature
    class: temperature
    dps:
      - id: 21
        type: integer
        name: sensor
        unit: C
`);

    expect(components.waterHeater?.inletTemperatureInC).toEqual({
      dataPoint: "21",
      kind: "sensor",
      measures: "temperature",
      readOnly: true,
      unit: "C",
    });
    expect(Object.keys(components.waterHeater ?? {})).toEqual([
      "mode",
      "inletTemperatureInC",
    ]);
  });

  it("names a control apart from another of its name by what the kinds of their entities do", () => {
    const { components } = entry(`name: Charger
entities:
  - entity: number
    class: current
    dps:
      - id: 4
        type: integer
        name: value
        unit: A
  - entity: sensor
    class: current
    dps:
      - id: 6
        type: integer
        name: sensor
        unit: A
  - entity: switch
    name: Schedule
    dps:
      - id: 2
        type: boolean
        name: switch
  - entity: text
    name: Schedule
    dps:
      - id: 16
        type: base64
        name: value
  - entity: select
    name: Charging mode
    dps:
      - id: 14
        type: string
        name: option
        mapping:
          - dps_val: now
            value: now
  - entity: text
    name: Charging mode
    dps:
      - id: 33
        type: base64
        name: value
  - entity: button
    name: Self check
    dps:
      - id: 8
        type: boolean
        name: button
  - entity: sensor
    name: Self check
    dps:
      - id: 9
        type: string
        name: sensor
  - entity: event
    class: doorbell
    dps:
      - id: 136
        type: string
        name: event
  - entity: binary_sensor
    name: Doorbell
    class: connectivity
    dps:
      - id: 155
        type: boolean
        name: sensor
`);

    expect(
      Object.fromEntries(
        Object.entries(components.device ?? {}).map(([name, control]) => [
          name,
          control.dataPoint,
        ]),
      ),
    ).toEqual({
      currentSettingInA: "4",
      currentInA: "6",
      scheduleEnabled: "2",
      schedule: "16",
      chargingMode: "14",
      chargingModeData: "33",
      selfCheck: "8",
      selfCheckState: "9",
      doorbell: "136",
      doorbellConnectivity: "155",
    });
  });

  it("puts an entity whose control takes the name of the main entity's in the device's own component", () => {
    const { components } = entry(`name: Aroma diffuser
entities:
  - entity: switch
    dps:
      - id: 1
        type: boolean
        name: switch
  - entity: switch
    name: Spray
    dps:
      - id: 2
        type: boolean
        name: switch
  - entity: light
    dps:
      - id: 7
        type: boolean
        name: switch
`);

    expect(components).toEqual({
      light: {
        spray: { dataPoint: "2", kind: "switch" },
        on: { dataPoint: "7", kind: "switch" },
      },
      device: { on: { dataPoint: "1", kind: "switch" } },
    });
  });

  it("passes over a setting's name another control holds", () => {
    const { components } = entry(`name: Pool monitor
entities:
  - entity: number
    name: pH
    dps:
      - id: 1
        type: integer
        name: value
  - entity: sensor
    name: pH
    dps:
      - id: 2
        type: integer
        name: sensor
  - entity: switch
    name: pH setting
    dps:
      - id: 3
        type: boolean
        name: switch
`);

    expect(
      Object.fromEntries(
        Object.entries(components.device ?? {}).map(([name, control]) => [
          name,
          control.dataPoint,
        ]),
      ),
    ).toEqual({ ph: "1", secondPh: "2", phSetting: "3" });
  });

  it("reads a unit another control reads its unit from as C and F", () => {
    const { components } = entry(`name: Heater
entities:
  - entity: climate
    dps:
      - id: 2
        type: integer
        name: temperature
      - id: 19
        type: string
        name: temperature_unit
        mapping:
          - dps_val: c
            value: celsius
          - dps_val: f
            value: fahrenheit
  - entity: sensor
    name: Floor temperature
    class: temperature
    dps:
      - id: 3
        type: integer
        name: sensor
      - id: 19
        type: string
        name: unit
`);

    const units = [
      { raw: "c", value: "C" },
      { raw: "f", value: "F" },
    ];
    expect(components.climate?.temperatureUnit?.values).toEqual(units);
    expect(components.climate?.floorTemperatureUnit).toEqual({
      dataPoint: "19",
      kind: "sensor",
      readOnly: true,
      values: units,
    });
  });

  it("reads any control whose values are temperature units as C and F, and leaves one with another value", () => {
    const { components } = entry(`name: Kettle
entities:
  - entity: select
    translation_key: temperature_unit
    dps:
      - id: 9
        type: string
        name: option
        mapping:
          - dps_val: c
            value: celsius
          - dps_val: f
            value: fahrenheit
  - entity: select
    name: Display unit
    dps:
      - id: 10
        type: string
        name: option
        mapping:
          - dps_val: c
            value: C
          - dps_val: f
            value: V
`);

    expect(components.device?.temperatureUnit?.values).toEqual([
      { raw: "c", value: "C" },
      { raw: "f", value: "F" },
    ]);
    expect(components.device?.displayUnit?.values).toEqual([
      { raw: "c", value: "C" },
      { raw: "f", value: "V" },
    ]);
  });

  it("names two components of one translation key by their names", () => {
    const { components } = entry(`name: Thermostat
entities:
  - entity: climate
    name: Probe 1
    translation_key: thermostat
    dps:
      - id: 1
        type: boolean
        name: hvac_mode
  - entity: climate
    name: Probe 2
    translation_key: thermostat
    dps:
      - id: 2
        type: boolean
        name: hvac_mode
`);

    expect(Object.keys(components)).toEqual(["probe1", "probe2"]);
  });

  it("names by position only what nothing else tells apart, an entity's own data point first", () => {
    const { components } = entry(`name: Charger
entities:
  - entity: sensor
    translation_key: status
    dps:
      - id: 118
        type: string
        name: status
      - id: 3
        type: string
        name: sensor
`);

    expect(
      Object.fromEntries(
        Object.entries(components.device ?? {}).map(([name, control]) => [
          name,
          control.dataPoint,
        ]),
      ),
    ).toEqual({ status: "3", secondStatus: "118" });
  });
});
