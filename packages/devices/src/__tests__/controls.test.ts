import { describe, expect, it } from "vitest";
import { readControls, writeControls } from "../controls.js";
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
        values: [
          { raw: true, value: "heat" },
          { raw: false, value: "off" },
        ],
      },
      targetTemperatureInC: {
        dataPoint: "2",
        unit: "C",
        min: 10,
        max: 70,
        scale: 2,
      },
      preset: {
        dataPoint: "3",
        values: [
          { raw: "low", value: "eco" },
          { raw: "high", value: "boost" },
          { raw: "af", value: "away", readOnly: true },
        ],
      },
      speed: {
        dataPoint: "4",
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
        readOnly: true,
        values: [{ raw: 0, value: false }],
        otherwise: true,
      },
      overheat: {
        dataPoint: "5",
        readOnly: true,
        values: [{ raw: 4, value: true }],
        otherwise: false,
      },
      childLock: { dataPoint: "6", absent: false },
      colorTemperatureInK: {
        dataPoint: "7",
        unit: "K",
        min: 0,
        max: 1000,
        step: 10,
        invert: true,
        targetRange: { min: 2700, max: 6500 },
      },
      brightness: { dataPoint: "8", min: 10, max: 1000 },
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
