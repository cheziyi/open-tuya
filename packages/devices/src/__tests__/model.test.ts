import type { TuyaDeviceModel } from "@open-tuya/core";
import { describe, expect, it } from "vitest";
import { readControls } from "../controls.js";
import { createDeviceEntry } from "../model.js";

// A motion sensor that also reads the temperature, whose product the catalog
// does not list, as the Smart Life cloud describes it.
const MOTION_SENSOR: TuyaDeviceModel = {
  "1": { code: "pir", type: "enum", range: ["pir", "none"] },
  "4": {
    code: "battery_percentage",
    type: "integer",
    min: 0,
    max: 100,
    step: 1,
    scale: 0,
    unit: "%",
  },
  "7": {
    code: "temp_current",
    type: "integer",
    min: -400,
    max: 2000,
    step: 1,
    scale: 1,
    unit: "℃",
  },
  "10": { code: "pir_time", type: "enum", range: ["30s", "60s", "120s"] },
};

describe("createDeviceEntry", () => {
  it("names a motion sensor's controls by their codes, and reads them", () => {
    const entry = createDeviceEntry(MOTION_SENSOR, {
      category: "pir",
      name: "Motion sensor",
    });

    expect(entry).toEqual({
      name: "Motion sensor",
      products: [],
      dataPoints: {
        "1": { type: "string" },
        "4": { type: "integer" },
        "7": { type: "integer" },
      },
      components: {
        device: {
          motion: {
            dataPoint: "1",
            kind: "sensor",
            measures: "motion",
            readOnly: true,
            values: [{ raw: "pir", value: true }],
            otherwise: false,
          },
          batteryInPercent: {
            dataPoint: "4",
            kind: "sensor",
            measures: "battery",
            reading: "instant",
            readOnly: true,
            unit: "%",
          },
          temperatureInC: {
            dataPoint: "7",
            kind: "sensor",
            measures: "temperature",
            reading: "instant",
            readOnly: true,
            unit: "C",
            scale: 10,
          },
        },
      },
    });
    if (entry === undefined) {
      throw new Error("No entry");
    }
    expect(
      readControls(entry, { "1": "pir", "4": 100, "7": 252, "10": "60s" }),
    ).toEqual({
      device: { motion: true, batteryInPercent: 100, temperatureInC: 25.2 },
    });
    expect(readControls(entry, { "1": "none" }).device?.motion).toBe(false);
  });

  it("names a power strip's outlets, its USB ports and its child lock", () => {
    const entry = createDeviceEntry(
      {
        "1": { code: "switch_1", type: "boolean" },
        "2": { code: "switch_2", type: "boolean" },
        "7": { code: "switch_usb1", type: "boolean" },
        "13": { code: "child_lock", type: "boolean" },
        "19": { code: "cur_power", type: "integer", scale: 1, unit: "W" },
      },
      { category: "pc", name: "Power strip" },
    );

    expect(entry?.components).toEqual({
      device: {
        switch1: { dataPoint: "1", kind: "switch" },
        switch2: { dataPoint: "2", kind: "switch" },
        usbSwitch1: { dataPoint: "7", kind: "switch" },
        childLock: { dataPoint: "13", kind: "switch", category: "config" },
      },
    });
  });

  it("takes a code's meaning from the device's category", () => {
    const door = { "1": { code: "switch", type: "boolean" } } as const;

    expect(
      createDeviceEntry(door, { category: "mcs", name: "Door" })?.components,
    ).toEqual({
      device: {
        door: {
          dataPoint: "1",
          kind: "sensor",
          measures: "door",
          readOnly: true,
        },
      },
    });
    expect(
      createDeviceEntry(door, { category: "cz", name: "Plug" })?.components,
    ).toEqual({ device: { switch: { dataPoint: "1", kind: "switch" } } });
    expect(
      createDeviceEntry(
        { "1": { code: "pir", type: "enum", range: ["pir", "none"] } },
        { category: "cz", name: "Plug" },
      ),
    ).toBeUndefined();
  });

  it("gives a wall switch 22 gangs and a plug 6", () => {
    const gangs: TuyaDeviceModel = {
      "1": { code: "switch_6", type: "boolean" },
      "2": { code: "switch_7", type: "boolean" },
      "3": { code: "switch_22", type: "boolean" },
      "4": { code: "switch_23", type: "boolean" },
    };

    expect(
      Object.keys(
        createDeviceEntry(gangs, { category: "kg", name: "Switch" })?.components
          .device ?? {},
      ),
    ).toEqual(["switch6", "switch7", "switch22"]);
    expect(
      Object.keys(
        createDeviceEntry(gangs, { category: "cz", name: "Plug" })?.components
          .device ?? {},
      ),
    ).toEqual(["switch6"]);
  });

  it("reads a detector's enum by the values its range holds", () => {
    const leak = createDeviceEntry(
      {
        "1": {
          code: "watersensor_state",
          type: "enum",
          range: ["normal", "alarm"],
        },
      },
      { category: "sj", name: "Leak" },
    );
    const presence = createDeviceEntry(
      { "1": { code: "presence_state", type: "enum" } },
      { category: "hps", name: "Presence" },
    );

    expect(leak?.components.device?.moisture?.values).toEqual([
      { raw: "alarm", value: true },
    ]);
    expect(
      presence?.components.device?.occupancy?.values?.map(({ raw }) => raw),
    ).toEqual(["presence", "small_move", "large_move", "peaceful"]);
  });

  it("reads a temperature in Fahrenheit, and in Celsius when the model names no unit", () => {
    const entry = createDeviceEntry(
      {
        "1": { code: "temp_current", type: "integer", unit: "℉" },
        "2": { code: "humidity_value", type: "integer" },
      },
      { category: "wsdcg", name: "Thermometer" },
    );
    const celsius = createDeviceEntry(
      { "1": { code: "va_temperature", type: "integer" } },
      { category: "wsdcg", name: "Thermometer" },
    );

    expect(Object.keys(entry?.components.device ?? {})).toEqual([
      "temperatureInF",
      "humidityInPercent",
    ]);
    expect(celsius?.components.device?.temperatureInC?.unit).toBe("C");
  });

  it("gives a control to the first data point that names it", () => {
    const entry = createDeviceEntry(
      {
        "1": { code: "temp_current", type: "integer" },
        "2": { code: "va_temperature", type: "integer" },
      },
      { category: "wsdcg", name: "Thermometer" },
    );

    expect(entry?.components.device?.temperatureInC?.dataPoint).toBe("1");
    expect(entry?.dataPoints).toEqual({ "1": { type: "integer" } });
  });

  it("leaves out a data point of another type, unit or range than its code takes", () => {
    expect(
      createDeviceEntry(
        {
          "1": { code: "pir", type: "enum", range: ["motion", "none"] },
          "2": { code: "pir", type: "boolean" },
          "3": { code: "temp_current", type: "integer", unit: "K" },
          "4": { code: "temp_current", type: "string" },
          "5": { code: "battery_percentage", type: "integer", unit: "mV" },
          "6": { code: "humidity_value", type: "enum" },
          "7": { code: "watersensor_state", type: "boolean" },
          "8": { code: "doorcontact_state", type: "enum" },
          "9": { code: "switch", type: "enum" },
          "10": { code: "toString", type: "boolean" },
        },
        { category: "pir", name: "Motion sensor" },
      ),
    ).toBeUndefined();
    expect(
      createDeviceEntry(
        { "1": { code: "switch", type: "boolean" } },
        { category: "toString", name: "Unknown" },
      ),
    ).toBeUndefined();
  });
});
