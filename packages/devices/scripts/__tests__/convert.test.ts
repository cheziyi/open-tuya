import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertDeviceFile } from "../convert.ts";

// smartplugv1.yaml, moes_bht002_thermostat_c.yaml and poolsana_heatpump.yaml
// are tuya-local's own device files, copied from
// https://github.com/make-all/tuya-local/tree/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/devices.
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
      productKeys: ["37mnhia3pojleqfh", "kOKEJBFoF9VNB5FR", "bWBb4e6BTZGie0Lv"],
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
            readOnly: true,
            unit: "V",
            scale: 10,
          },
          currentInMilliamps: {
            dataPoint: "4",
            kind: "sensor",
            measures: "current",
            readOnly: true,
            unit: "mA",
          },
          powerInW: {
            dataPoint: "5",
            kind: "sensor",
            measures: "power",
            readOnly: true,
            unit: "W",
            scale: 10,
          },
          overcurrentAlarm: {
            dataPoint: "7",
            kind: "sensor",
            measures: "problem",
            readOnly: true,
            absent: false,
          },
          timerInSeconds: {
            dataPoint: "2",
            kind: "number",
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
      unsupported: "not valid YAML 1.2",
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
      "a data point given two types",
      "sensor",
      "        type: integer\n        name: sensor\n      - id: 1\n        type: string\n        name: description",
      "one data point given two types",
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
      "a format on a string",
      "light",
      "        type: string\n        name: rgbhsv\n        format:\n          - name: h\n            bytes: 2",
      "`format` on a data point that is not hex or base64",
    ],
    [
      "a format field of 3 bytes",
      "light",
      "        type: hex\n        name: rgbhsv\n        format:\n          - name: h\n            bytes: 3",
      "a `format` field of other than 1, 2 or 4 bytes",
    ],
    [
      "conditions on the value while absent",
      "sensor",
      "        type: integer\n        name: sensor\n        mapping:\n          - dps_val: null\n            value: 0\n            constraint: sensor\n            conditions:\n              - dps_val: 1\n                value: 2",
      "conditions on the value while the data point is absent",
    ],
    [
      "a constraint the entity lacks",
      "sensor",
      "        type: integer\n        name: sensor\n        mapping:\n          - dps_val: 1\n            constraint: mode\n            conditions:\n              - dps_val: a\n                value: 2",
      "a `constraint` the entity lacks",
    ],
    [
      "a range in a condition",
      "sensor",
      "        type: integer\n        name: sensor\n        mapping:\n          - constraint: sensor\n            conditions:\n              - dps_val: 1\n                range:\n                  min: 0\n                  max: 5",
      "a mapping's own `range`",
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
      stdRgbhsvColorBrightness: {
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
          measures: "problem",
          readOnly: true,
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
        absent: "eco",
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
