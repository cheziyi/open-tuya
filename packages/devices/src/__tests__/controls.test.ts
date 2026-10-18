import { describe, expect, it } from "vitest";
import { listDependencies, readControls, writeControls } from "../controls.js";
import type { TuyaDeviceEntry } from "../entry.js";

const ENTRY: TuyaDeviceEntry = {
  name: "Heater",
  productKeys: ["70kki9an9nr0oqbj"],
  dataPoints: {
    "1": { type: "boolean" },
    "2": { type: "integer" },
    "3": { type: "string" },
    "4": { type: "integer" },
    "5": { type: "bitfield" },
    "6": { type: "boolean", optional: true },
    "7": { type: "integer" },
    "8": { type: "integer" },
  },
  components: {
    climate: {
      hvacMode: {
        dataPoint: "1",
        kind: "select",
        values: [
          { raw: true, value: "heat" },
          { raw: false, value: "off" },
        ],
      },
      targetTemperatureInC: {
        dataPoint: "2",
        kind: "number",
        unit: "C",
        min: 10,
        max: 70,
        scale: 2,
      },
      preset: {
        dataPoint: "3",
        kind: "select",
        values: [
          { raw: "low", value: "eco" },
          { raw: "high", value: "boost" },
          { raw: "af", value: "away", readOnly: true },
        ],
      },
      speed: {
        dataPoint: "4",
        kind: "select",
        values: [
          { raw: 1, value: 33 },
          { raw: 2, value: 66 },
          { raw: 3, value: 100 },
        ],
      },
    },
    device: {
      fault: {
        dataPoint: "5",
        kind: "sensor",
        readOnly: true,
        values: [{ raw: 0, value: false }],
        otherwise: true,
      },
      overheat: {
        dataPoint: "5",
        kind: "sensor",
        readOnly: true,
        values: [{ raw: 4, value: true }],
        otherwise: false,
      },
      childLock: { dataPoint: "6", kind: "switch", absent: false },
      colorTemperatureInK: {
        dataPoint: "7",
        kind: "number",
        unit: "K",
        min: 0,
        max: 1000,
        step: 10,
        invert: true,
        targetRange: { min: 2700, max: 6500 },
      },
      brightness: { dataPoint: "8", kind: "number", min: 10, max: 1000 },
    },
  },
  source: { file: "heater.yaml", commit: "0".repeat(40) },
};

describe("readControls", () => {
  it("converts each data point to its control's value", () => {
    expect(
      readControls(ENTRY, {
        "1": true,
        "2": 41,
        "3": "high",
        "4": 2,
        "5": 0,
        "7": 0,
        "8": 500,
      }),
    ).toEqual({
      climate: {
        hvacMode: "heat",
        targetTemperatureInC: 20.5,
        preset: "boost",
        speed: 66,
      },
      device: {
        fault: false,
        overheat: false,
        childLock: false,
        colorTemperatureInK: 6500,
        brightness: 500,
      },
    });
  });

  it("matches a bitfield's raw value by any bit they share", () => {
    expect(readControls(ENTRY, { "5": 6 }).device).toEqual({
      fault: true,
      overheat: true,
      childLock: false,
    });
  });

  it("reads a number a device sends as a string", () => {
    expect(readControls(ENTRY, { "2": "41" }).climate).toEqual({
      targetTemperatureInC: 20.5,
    });
  });

  it("hands on a raw value no mapping names", () => {
    expect(readControls(ENTRY, { "3": "turbo" }).climate).toEqual({
      preset: "turbo",
    });
  });

  it("leaves out a control whose data point is missing, unless it has a value for that", () => {
    expect(readControls(ENTRY, {})).toEqual({ device: { childLock: false } });
  });
});

describe("writeControls", () => {
  it("converts each control's value to its data point's raw value", () => {
    expect(
      writeControls(ENTRY, {
        climate: {
          hvacMode: "off",
          targetTemperatureInC: 20.5,
          preset: "eco",
        },
        device: { colorTemperatureInK: 2700, brightness: 500 },
      }),
    ).toEqual({ "1": false, "2": 41, "3": "low", "7": 1000, "8": 500 });
  });

  it("rounds to the step, and writes the nearest mapped number", () => {
    expect(
      writeControls(ENTRY, {
        climate: { speed: 70 },
        device: { colorTemperatureInK: 4600 },
      }),
    ).toEqual({ "4": 2, "7": 500 });
  });

  it("never writes a value that is read-only, and passes it on as given", () => {
    expect(writeControls(ENTRY, { climate: { preset: "away" } })).toEqual({
      "3": "away",
    });
  });

  it("throws a RangeError outside the data point's range", () => {
    expect(() =>
      writeControls(ENTRY, { climate: { targetTemperatureInC: 40 } }),
    ).toThrow(RangeError);
  });

  it("throws a TypeError for a read-only control or one the entry lacks", () => {
    expect(() => writeControls(ENTRY, { device: { fault: true } })).toThrow(
      TypeError,
    );
    expect(() => writeControls(ENTRY, { device: { volume: 3 } })).toThrow(
      TypeError,
    );
  });
});

// The expected values are tuya-local's: its tests' for data points 1 and 2,
// and for data points 3 and 5 computed by the expressions of its get_value
// and get_values_to_set at
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L486-L514
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L1129-L1161.
const PACKED: TuyaDeviceEntry = {
  name: "Meter",
  productKeys: [],
  dataPoints: {
    "1": { type: "hex" },
    "2": { type: "base64" },
    "3": { type: "base64" },
    "4": { type: "integer" },
    "5": { type: "hex" },
  },
  components: {
    device: {
      high: { dataPoint: "1", mask: "ff00", kind: "number" },
      special: {
        dataPoint: "2",
        mask: "ffff",
        kind: "select",
        values: [{ raw: 256, value: "special_case" }],
      },
      currentInA: {
        dataPoint: "3",
        mask: "0000000000FFFFFFFF00000000",
        maskSigned: true,
        littleEndian: true,
        kind: "number",
        scale: 1000,
      },
      voltageInV: {
        dataPoint: "3",
        mask: "000000000000000000FFFFFFFF",
        littleEndian: true,
        kind: "number",
        scale: 100,
      },
      nibble: { dataPoint: "4", mask: "00F0", kind: "number" },
    },
    light: {
      on: {
        dataPoint: "5",
        mask: "000100000000",
        kind: "switch",
        values: [
          { raw: 0, value: false },
          { raw: 1, value: true },
        ],
        otherwise: true,
      },
      brightness: {
        dataPoint: "5",
        mask: "0000FFFF0000",
        kind: "number",
        min: 0,
        max: 1000,
      },
    },
  },
  source: { file: "meter.yaml", commit: "0".repeat(40) },
};
const METER = "EFoAAMj6//8AAQIDBA==";

describe("readControls with a mask", () => {
  it("reads the bits a mask covers, then maps and scales them", () => {
    expect(
      readControls(PACKED, {
        "1": "babe",
        "2": "AQA=",
        "3": METER,
        "4": 0x1234,
        "5": "000101f40000",
      }),
    ).toEqual({
      device: {
        high: 0xba,
        special: "special_case",
        currentInA: -1.336,
        voltageInV: 230.56,
        nibble: 3,
      },
      light: { on: true, brightness: 500 },
    });
  });

  it("pads a hex value of an odd number of digits to whole bytes", () => {
    expect(readControls(PACKED, { "1": "abe" }).device).toEqual({ high: 0x0a });
  });

  it("leaves out a control whose value does not decode", () => {
    expect(readControls(PACKED, { "1": "xyz", "2": "@@" })).toEqual({});
  });
});

describe("writeControls with a mask", () => {
  it("sets the bits a mask covers, and keeps the rest from the current value", () => {
    expect(
      writeControls(
        PACKED,
        {
          device: {
            high: 0xca,
            special: "special_case",
            voltageInV: 231,
            nibble: 9,
          },
        },
        { "1": "babe", "2": "AAA=", "3": METER, "4": 0x1234 },
      ),
    ).toEqual({
      "1": "cabe",
      "2": "AQA=",
      "3": "PFoAAMj6//8AAQIDBA==",
      "4": 0x1294,
    });
  });

  it("writes a signed number in two's complement", () => {
    expect(
      writeControls(PACKED, { device: { currentInA: -1.5 } }, { "3": METER }),
    ).toEqual({ "3": "EFoAACT6//8AAQIDBA==" });
  });

  it("sets each control's bits on those the one before it set", () => {
    expect(
      writeControls(
        PACKED,
        { light: { on: true, brightness: 500 } },
        { "5": "000000000000" },
      ),
    ).toEqual({ "5": "000101f40000" });
  });

  it("throws a TypeError without the data point's current value", () => {
    expect(() => writeControls(PACKED, { device: { high: 1 } })).toThrow(
      TypeError,
    );
  });

  it("throws a RangeError for a current value of another length than the mask", () => {
    expect(() =>
      writeControls(PACKED, { device: { high: 1 } }, { "1": "00babe" }),
    ).toThrow(RangeError);
  });

  it("throws a RangeError for a value its bits cannot hold", () => {
    expect(() =>
      writeControls(PACKED, { device: { nibble: 16 } }, { "4": 0 }),
    ).toThrow(RangeError);
  });
});

// Each control depends on another data point, as tuya-local's constraint and
// conditions describe at
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/devices/README.md#L490-L578.
const DEPENDENT: TuyaDeviceEntry = {
  name: "Thermostat",
  productKeys: [],
  dataPoints: {
    "1": { type: "boolean" },
    "2": { type: "integer" },
    "3": { type: "string" },
    "4": { type: "string" },
    "5": { type: "bitfield" },
    "6": { type: "boolean" },
    "7": { type: "integer" },
    "8": { type: "string" },
    "9": { type: "string" },
  },
  components: {
    climate: {
      hvacMode: {
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
                { when: ["2"], value: "boost", readOnly: true },
              ],
            },
          },
        ],
      },
      targetTemperature: {
        dataPoint: "2",
        kind: "number",
        min: 50,
        max: 900,
        scale: 10,
        step: 5,
        dependsOn: {
          dataPoint: "3",
          conditions: [{ when: ["f"], scale: 1, step: 10 }],
        },
      },
      preset: {
        dataPoint: "8",
        kind: "select",
        values: [
          { raw: "eco", value: "eco" },
          {
            raw: "manual",
            dependsOn: {
              dataPoint: "9",
              readOnly: true,
              conditions: [{ when: ["on", "standby"], value: "manual" }],
            },
          },
        ],
      },
    },
    device: {
      alarm: {
        dataPoint: "6",
        kind: "sensor",
        readOnly: true,
        values: [
          {
            raw: true,
            value: true,
            dependsOn: {
              dataPoint: "5",
              conditions: [
                { when: [6], value: false },
                { when: [null], value: false },
              ],
            },
          },
        ],
      },
      scene: {
        dataPoint: "7",
        kind: "select",
        dependsOn: {
          dataPoint: "4",
          conditions: [
            { when: ["0"], values: [{ raw: 0, value: "Candle" }] },
            { when: ["1"], values: [{ raw: 0, value: "Rainbow" }] },
          ],
        },
      },
    },
  },
  source: { file: "thermostat.yaml", commit: "0".repeat(40) },
};

describe("readControls with conditions", () => {
  it("takes the value, the scale and the mapping of the condition that holds", () => {
    expect(
      readControls(DEPENDENT, {
        "1": true,
        "2": 70,
        "3": "f",
        "4": "1",
        "7": 0,
      }),
    ).toEqual({
      climate: { hvacMode: "heat", targetTemperature: 70 },
      device: { scene: "Rainbow" },
    });
    expect(readControls(DEPENDENT, { "2": 215, "3": "c" }).climate).toEqual({
      targetTemperature: 21.5,
    });
  });

  it("holds a bitfield's condition while every one of its bits is set, and a null one while the data point is absent", () => {
    expect(readControls(DEPENDENT, { "5": 7, "6": true }).device).toEqual({
      alarm: false,
    });
    expect(readControls(DEPENDENT, { "5": 2, "6": true }).device).toEqual({
      alarm: true,
    });
    expect(readControls(DEPENDENT, { "6": true }).device).toEqual({
      alarm: false,
    });
  });

  it("reads a value only a read-only condition gives", () => {
    expect(readControls(DEPENDENT, { "1": true, "4": "2" }).climate).toEqual({
      hvacMode: "boost",
    });
  });
});

describe("writeControls with conditions", () => {
  it("sets the data point a condition depends on, to the value it needs", () => {
    expect(
      writeControls(DEPENDENT, { climate: { hvacMode: "heat" } }, { "4": "0" }),
    ).toEqual({ "1": true, "4": "1" });
    expect(writeControls(DEPENDENT, { climate: { hvacMode: "off" } })).toEqual({
      "1": false,
    });
  });

  it("converts a number by the condition that holds now", () => {
    expect(
      writeControls(
        DEPENDENT,
        { climate: { targetTemperature: 74 } },
        { "3": "f" },
      ),
    ).toEqual({ "2": 70 });
    expect(
      writeControls(
        DEPENDENT,
        { climate: { targetTemperature: 21.6 } },
        { "3": "c" },
      ),
    ).toEqual({ "2": 215 });
  });

  it("writes a nested mapping's raw value by the condition that holds now", () => {
    expect(
      writeControls(DEPENDENT, { device: { scene: "Rainbow" } }, { "4": "1" }),
    ).toEqual({ "7": 0 });
  });

  it("writes a value a read-only data point allows, without setting it", () => {
    expect(
      writeControls(
        DEPENDENT,
        { climate: { preset: "manual" } },
        { "9": "standby" },
      ),
    ).toEqual({ "8": "manual" });
  });

  it("throws VALUE_UNAVAILABLE for a value a read-only data point does not allow now", () => {
    expect(() =>
      writeControls(
        DEPENDENT,
        { climate: { preset: "manual" } },
        { "9": "off" },
      ),
    ).toThrow(expect.objectContaining({ code: "VALUE_UNAVAILABLE" }));
  });

  it("passes on a value only a read-only condition gives, as given", () => {
    expect(
      writeControls(DEPENDENT, { climate: { hvacMode: "boost" } }),
    ).toEqual({ "1": "boost" });
  });
});

describe("listDependencies", () => {
  it("lists the data points other than its own that a control depends on", () => {
    const hvacMode = DEPENDENT.components.climate?.hvacMode;
    const alarm = DEPENDENT.components.device?.alarm;
    expect(hvacMode && listDependencies(hvacMode)).toEqual(["4"]);
    expect(alarm && listDependencies(alarm)).toEqual(["5"]);
  });
});
