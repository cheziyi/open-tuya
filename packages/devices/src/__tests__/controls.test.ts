import { describe, expect, it } from "vitest";
import {
  listDependencies,
  readControls,
  resolveControl,
  writeControls,
} from "../controls.js";
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
      childLock: {
        dataPoint: "6",
        kind: "switch",
        whenAbsent: { value: false },
      },
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

// Each control reads, and most write, another data point in some states, as
// tuya-local's value_redirect, value_mirror and range describe at
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/devices/README.md#L438-L465.
const REDIRECTING: TuyaDeviceEntry = {
  name: "Heater",
  productKeys: [],
  dataPoints: {
    "1": { type: "string" },
    "2": { type: "integer" },
    "3": { type: "integer" },
    "4": { type: "integer", optional: true },
    "5": { type: "integer" },
    "6": { type: "integer" },
    "7": { type: "integer" },
    "8": { type: "integer", optional: true },
    "9": { type: "integer" },
    "10": { type: "integer" },
    "11": { type: "string" },
  },
  components: {
    climate: {
      targetTemperatureInC: {
        dataPoint: "2",
        kind: "number",
        unit: "C",
        min: 50,
        max: 300,
        scale: 10,
        step: 5,
        dependsOn: {
          dataPoint: "1",
          conditions: [
            {
              when: ["eco"],
              redirect: {
                dataPoint: "3",
                min: 50,
                max: 160,
                scale: 10,
                step: 10,
              },
            },
          ],
        },
      },
      preset: {
        dataPoint: "1",
        kind: "select",
        values: [
          { raw: "eco", value: "eco" },
          { raw: "comfort", value: "comfort" },
        ],
      },
    },
    device: {
      powerInW: {
        dataPoint: "4",
        kind: "number",
        whenAbsent: { redirect: { dataPoint: "8", scale: 10 } },
      },
      position: {
        dataPoint: "5",
        kind: "number",
        whenAbsent: { mirror: { dataPoint: "6" } },
      },
      limit: {
        dataPoint: "9",
        kind: "number",
        dependsOn: {
          dataPoint: "1",
          conditions: [
            { when: ["eco"], redirect: { dataPoint: "7", readOnly: true } },
          ],
        },
      },
      temperature: {
        dataPoint: "10",
        kind: "number",
        min: 0,
        max: 100,
        dependsOn: {
          dataPoint: "11",
          conditions: [{ when: ["f"], min: 32, max: 212 }],
        },
      },
    },
  },
  source: { file: "heater.yaml", commit: "0".repeat(40) },
};

describe("readControls with redirects", () => {
  it("reads the data point a condition redirects to, as it converts", () => {
    expect(
      readControls(REDIRECTING, { "1": "comfort", "2": 215, "3": 120 }).climate,
    ).toEqual({ targetTemperatureInC: 21.5, preset: "comfort" });
    expect(
      readControls(REDIRECTING, { "1": "eco", "2": 215, "3": 120 }).climate,
    ).toEqual({ targetTemperatureInC: 12, preset: "eco" });
  });

  it("reads another data point while its own is absent, redirected or mirrored", () => {
    expect(readControls(REDIRECTING, { "6": 40, "8": 2300 }).device).toEqual({
      powerInW: 230,
      position: 40,
    });
    expect(readControls(REDIRECTING, { "4": 5, "5": 30 }).device).toEqual({
      powerInW: 5,
      position: 30,
    });
  });
});

describe("writeControls with redirects", () => {
  it("writes the data point a condition redirects to, as it converts", () => {
    expect(
      writeControls(
        REDIRECTING,
        { climate: { targetTemperatureInC: 14 } },
        { "1": "eco" },
      ),
    ).toEqual({ "3": 140 });
    expect(
      writeControls(
        REDIRECTING,
        { climate: { targetTemperatureInC: 14 } },
        { "1": "comfort" },
      ),
    ).toEqual({ "2": 140 });
  });

  it("writes the data point its absent value redirects to, while its own is absent", () => {
    expect(
      writeControls(REDIRECTING, { device: { powerInW: 231 } }, {}),
    ).toEqual({ "8": 2310 });
    expect(
      writeControls(REDIRECTING, { device: { powerInW: 231 } }, { "4": 5 }),
    ).toEqual({ "4": 231 });
  });

  it("writes its own data point where it mirrors another", () => {
    expect(writeControls(REDIRECTING, { device: { position: 50 } })).toEqual({
      "5": 50,
    });
  });

  it("throws VALUE_UNAVAILABLE for a redirect to a read-only data point", () => {
    expect(() =>
      writeControls(REDIRECTING, { device: { limit: 3 } }, { "1": "eco" }),
    ).toThrow(expect.objectContaining({ code: "VALUE_UNAVAILABLE" }));
  });

  it("checks a value against the range of the condition that holds", () => {
    expect(
      writeControls(
        REDIRECTING,
        { device: { temperature: 150 } },
        { "11": "f" },
      ),
    ).toEqual({ "10": 150 });
    expect(() =>
      writeControls(
        REDIRECTING,
        { device: { temperature: 150 } },
        { "11": "c" },
      ),
    ).toThrow(RangeError);
  });
});

describe("resolveControl", () => {
  const { climate, device } = REDIRECTING.components;

  it("follows the redirect that holds, keeping what the control is", () => {
    expect(
      climate?.targetTemperatureInC &&
        resolveControl(REDIRECTING, climate.targetTemperatureInC, {
          "1": "eco",
        }),
    ).toEqual({
      dataPoint: "3",
      kind: "number",
      unit: "C",
      min: 50,
      max: 160,
      scale: 10,
      step: 10,
    });
  });

  it("applies the range of the condition that holds", () => {
    expect(
      device?.temperature &&
        resolveControl(REDIRECTING, device.temperature, { "11": "f" }),
    ).toMatchObject({ dataPoint: "10", min: 32, max: 212 });
  });

  it("lists the data points a control redirects to among its dependencies", () => {
    expect(
      climate?.targetTemperatureInC &&
        listDependencies(climate.targetTemperatureInC),
    ).toEqual(["1", "3"]);
  });
});

// A rule or a condition applies only while another data point allows it, and
// a condition can make the control unreadable and unwritable, as tuya-local's
// available and invalid describe at
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/devices/README.md#L466-L489.
const AVAILABLE: TuyaDeviceEntry = {
  name: "Dehumidifier",
  productKeys: [],
  dataPoints: {
    "1": { type: "string" },
    "2": { type: "string" },
    "3": { type: "boolean" },
    "4": { type: "integer" },
  },
  components: {
    fan: {
      speed: {
        dataPoint: "2",
        kind: "select",
        values: [
          {
            raw: "4",
            value: "turbo",
            availableWhile: {
              dataPoint: "1",
              values: [{ raw: "pro", value: true }],
              otherwise: false,
            },
          },
          { raw: "4", value: "boost" },
        ],
      },
      temperature: {
        dataPoint: "4",
        kind: "number",
        dependsOn: {
          dataPoint: "1",
          conditions: [
            { when: ["laundry"], invalid: true },
            { when: ["pro"], scale: 2, availableWhile: { dataPoint: "3" } },
          ],
        },
      },
    },
  },
  source: { file: "dehumidifier.yaml", commit: "0".repeat(40) },
};

describe("readControls with availability", () => {
  it("passes over a mapping while the data point it needs reads false", () => {
    expect(readControls(AVAILABLE, { "1": "pro", "2": "4" }).fan).toEqual({
      speed: "turbo",
    });
    expect(readControls(AVAILABLE, { "1": "lite", "2": "4" }).fan).toEqual({
      speed: "boost",
    });
  });

  it("passes over a condition while the data point it needs reads false", () => {
    expect(
      readControls(AVAILABLE, { "1": "pro", "3": true, "4": 40 }).fan
        ?.temperature,
    ).toBe(20);
    expect(
      readControls(AVAILABLE, { "1": "pro", "3": false, "4": 40 }).fan
        ?.temperature,
    ).toBe(40);
  });

  it("leaves out a control while an invalid condition holds", () => {
    expect(readControls(AVAILABLE, { "1": "laundry", "4": 40 })).toEqual({});
  });
});

describe("writeControls with availability", () => {
  it("writes through a mapping only while it is available", () => {
    expect(
      writeControls(AVAILABLE, { fan: { speed: "turbo" } }, { "1": "pro" }),
    ).toEqual({ "2": "4" });
    expect(
      writeControls(AVAILABLE, { fan: { speed: "boost" } }, { "1": "lite" }),
    ).toEqual({ "2": "4" });
  });

  it("converts by a condition only while it is available", () => {
    expect(
      writeControls(
        AVAILABLE,
        { fan: { temperature: 20 } },
        { "1": "pro", "3": true },
      ),
    ).toEqual({ "4": 40 });
    expect(
      writeControls(
        AVAILABLE,
        { fan: { temperature: 20 } },
        { "1": "pro", "3": false },
      ),
    ).toEqual({ "4": 20 });
  });

  it("throws VALUE_UNAVAILABLE while an invalid condition holds", () => {
    expect(() =>
      writeControls(
        AVAILABLE,
        { fan: { temperature: 20 } },
        { "1": "laundry" },
      ),
    ).toThrow(expect.objectContaining({ code: "VALUE_UNAVAILABLE" }));
  });

  it("lists the data point a rule's availability reads among the dependencies", () => {
    const { fan } = AVAILABLE.components;
    expect(fan?.speed && listDependencies(fan.speed)).toEqual(["1"]);
    expect(fan?.temperature && listDependencies(fan.temperature)).toEqual([
      "1",
      "3",
    ]);
  });
});

describe("utf16b64", () => {
  // "Hi" in UTF-16, big-endian, as base64.
  const HI = "AEgAaQ==";
  const MESSAGES: TuyaDeviceEntry = {
    name: "Doorbell",
    productKeys: [],
    dataPoints: { "1": { type: "utf16b64" }, "2": { type: "string" } },
    components: {
      device: {
        message: { dataPoint: "1", kind: "text" },
        greeting: {
          dataPoint: "1",
          kind: "select",
          values: [{ raw: "Hi", value: "hello" }],
        },
        name: { dataPoint: "2", type: "utf16b64", kind: "text" },
      },
    },
    source: { file: "doorbell.yaml", commit: "0".repeat(40) },
  };

  it("decodes the text before any mapping, by the control's own type", () => {
    expect(readControls(MESSAGES, { "1": HI, "2": HI }).device).toEqual({
      message: "Hi",
      greeting: "hello",
      name: "Hi",
    });
  });

  it("reads a value that does not decode as it came", () => {
    expect(readControls(MESSAGES, { "1": "AEg" }).device?.message).toBe("AEg");
    expect(readControls(MESSAGES, { "1": "AEgA" }).device?.message).toBe(
      "AEgA",
    );
  });

  it("encodes the text a write sets", () => {
    expect(
      writeControls(MESSAGES, { device: { greeting: "hello", name: "Hi" } }),
    ).toEqual({ "1": HI, "2": HI });
  });
});

describe("readControls with a constraint read through its conversion", () => {
  const entry: TuyaDeviceEntry = {
    name: "Meter",
    productKeys: [],
    dataPoints: {
      "1": { type: "base64" },
      "2": { type: "boolean", optional: true },
      "3": { type: "integer" },
    },
    components: {
      device: {
        lowBattery: {
          dataPoint: "2",
          kind: "sensor",
          readOnly: true,
          whenAbsent: {
            dependsOn: {
              dataPoint: "1",
              reads: {
                dataPoint: "1",
                mask: "0700",
                values: [
                  { raw: 0, value: "normal" },
                  { raw: 2, value: "low" },
                ],
              },
              readOnly: true,
              conditions: [
                { when: ["low"], value: true },
                { when: ["normal"], value: false },
              ],
            },
          },
        },
        powerInKw: {
          dataPoint: "3",
          kind: "sensor",
          readOnly: true,
          scale: 1000,
          dependsOn: {
            dataPoint: "1",
            reads: { dataPoint: "1", mask: "0001" },
            readOnly: true,
            conditions: [{ when: [1], scale: -1000 }],
          },
        },
      },
    },
    source: { file: "meter.yaml", commit: "0".repeat(40) },
  };

  it.each([
    ["AgA=", true, 1.5],
    ["AAE=", false, -1.5],
  ])(
    "matches the conditions against the value the mask and mapping read from %s",
    (status, lowBattery, powerInKw) => {
      expect(readControls(entry, { "1": status, "3": 1500 })).toEqual({
        device: { lowBattery, powerInKw },
      });
    },
  );
});

describe("readControls with a condition's value for an absent data point", () => {
  const entry: TuyaDeviceEntry = {
    name: "Vacuum",
    productKeys: [],
    dataPoints: {
      "2": { type: "boolean" },
      "5": { type: "string", optional: true },
    },
    components: {
      vacuum: {
        command: {
          dataPoint: "5",
          kind: "select",
          dependsOn: {
            dataPoint: "2",
            conditions: [
              {
                when: [false],
                values: [{ raw: "smart", value: "smart" }],
                whenAbsent: { value: "pause" },
              },
            ],
          },
        },
      },
    },
    source: { file: "vacuum.yaml", commit: "0".repeat(40) },
  };

  it("reads it while the condition holds and the device leaves the data point out", () => {
    expect(readControls(entry, { "2": false })).toEqual({
      vacuum: { command: "pause" },
    });
  });

  it("leaves the control out while the condition does not hold", () => {
    expect(readControls(entry, { "2": true })).toEqual({});
  });
});
