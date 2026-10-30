import type { TuyaDeviceModel, TuyaModelDataPoint } from "@open-tuya/core";
import type {
  TuyaControl,
  TuyaDataPointSpec,
  TuyaDeviceEntry,
} from "./entry.js";
import type { Measure } from "./vocabulary.js";

export interface CreateDeviceEntryOptions {
  /** The category the cloud lists the device in, such as `pir`: a code
   * stands for another thing in another category, as `switch` is the door
   * of a contact sensor. */
  category: string;
  /** The entry's `name`. */
  name: string;
}

interface NamedControl {
  name: string;
  control: Omit<TuyaControl, "dataPoint">;
}

type DescribeControl = (
  dataPoint: TuyaModelDataPoint,
) => NamedControl | undefined;

// Source: Home Assistant reads a temperature in any of these units as Celsius
// or Fahrenheit, in https://github.com/home-assistant/core/commit/4aadb848e18e8e69f01d31a163f76de2e87025d7,
// https://github.com/home-assistant/core/commit/85dac3d47ec9e04690d429c9dbb216917aedb77b
// and https://github.com/home-assistant/core/commit/71c665ed498754782fb632401505c5a5bccc6c26,
// and `temp_current` in Celsius when it names none, in
// https://github.com/home-assistant/core/commit/a4357fdb957bcad2827597a440fab9f0dc31567e.
const CELSIUS_UNITS = new Set(["°c", "c", "celsius", "℃"]);
const FAHRENHEIT_UNITS = new Set(["°f", "f", "fahrenheit", "℉"]);

// Source: An integer is its value divided by 10 to the power of its scale, in
// https://github.com/tuya/tuya-openclaw-skills/commit/016cb18098bb5302e24a9a33c1bcb665445eda7c.
/** The control's `scale`, or undefined when dividing by 10 to the model's
 * power gives no usable reading: the model names no scale, or one so large
 * that the power is infinite or 0. */
function scaleOf(
  dataPoint: TuyaModelDataPoint,
): { scale?: number } | undefined {
  if (dataPoint.scale === undefined) {
    return undefined;
  }
  const scale = 10 ** dataPoint.scale;
  if (!Number.isFinite(scale) || scale === 0) {
    return undefined;
  }
  return scale === 1 ? {} : { scale };
}

function temperature(dataPoint: TuyaModelDataPoint): NamedControl | undefined {
  const unit = dataPoint.unit?.toLowerCase();
  const symbol =
    unit === undefined || CELSIUS_UNITS.has(unit)
      ? "C"
      : FAHRENHEIT_UNITS.has(unit)
        ? "F"
        : undefined;
  const scale = scaleOf(dataPoint);
  if (
    dataPoint.type !== "integer" ||
    scale === undefined ||
    symbol === undefined
  ) {
    return undefined;
  }
  return {
    name: `temperatureIn${symbol}`,
    control: {
      kind: "sensor",
      measures: "temperature",
      reading: "instant",
      readOnly: true,
      unit: symbol,
      ...scale,
    },
  };
}

function percent(measures: Measure): DescribeControl {
  return (dataPoint) => {
    const scale = scaleOf(dataPoint);
    return dataPoint.type === "integer" &&
      scale !== undefined &&
      (dataPoint.unit === undefined || dataPoint.unit === "%")
      ? {
          name: `${measures}InPercent`,
          control: {
            kind: "sensor",
            measures,
            reading: "instant",
            readOnly: true,
            unit: "%",
            ...scale,
          },
        }
      : undefined;
  };
}

// Source: Home Assistant reads a binary sensor as on while its value is its
// `on_value`, true unless it names one, in
// https://github.com/home-assistant/core/commit/892bf62dd579984e43439760bc3eb646cadb784b.
/** A detector reads a boolean, or, given `onValues`, an enum that is true
 * while it holds one of them. An enum whose range holds none of them is not
 * this detector. */
function detector(
  name: string,
  measures: Measure,
  onValues?: readonly string[],
): DescribeControl {
  return (dataPoint) => {
    const control = { kind: "sensor", measures, readOnly: true } as const;
    if (onValues === undefined) {
      return dataPoint.type === "boolean" ? { name, control } : undefined;
    }
    const held = onValues.filter(
      (value) => dataPoint.range?.includes(value) ?? true,
    );
    if (dataPoint.type !== "enum" || held.length === 0) {
      return undefined;
    }
    return {
      name,
      control: {
        ...control,
        values: held.map((raw) => ({ raw, value: true })),
        otherwise: false,
        whenAbsent: { value: null },
      },
    };
  };
}

function onOff(name: string, category?: "config"): DescribeControl {
  return (dataPoint) =>
    dataPoint.type === "boolean"
      ? { name, control: { kind: "switch", ...(category && { category }) } }
      : undefined;
}

// Source: Home Assistant shows these codes as the same reading in every
// category it lists them in: `temp_current` and `humidity_value` from
// https://github.com/home-assistant/core/commit/a7c7e58a5b1aa3b68111fe0e871d7392eed0cc76,
// `va_temperature` and `va_humidity` from
// https://github.com/home-assistant/core/commit/c204196a7ad1860897e2ecfb189f7bd1d6a9e219,
// `va_battery` from
// https://github.com/home-assistant/core/commit/35872a212b2340d3906557e5f644d99f7360ff15,
// and `battery_percentage` from
// https://github.com/home-assistant/core/commit/cef34356e2a66c1a51324c8b095183316b612ad4.
const READINGS: Readonly<Record<string, DescribeControl>> = {
  temp_current: temperature,
  va_temperature: temperature,
  humidity_value: percent("humidity"),
  va_humidity: percent("humidity"),
  battery_percentage: percent("battery"),
  va_battery: percent("battery"),
};

// Source: A power strip's and a plug's switch_1 to switch_6, beside
// switch_usb1 to switch_usb6, a switch and a child lock, in
// https://github.com/home-assistant/core/commit/14c380fb578066e13c1d5ae145ae9dc24c51e443,
// and a wall switch's gangs switch_1 to switch_22, in
// https://github.com/home-assistant/core/commit/b40094127a490cd15a391816ecac9ba9f0e79718.
function switches(count: number): Record<string, DescribeControl> {
  const controls: Record<string, DescribeControl> = {
    switch: onOff("switch"),
    child_lock: onOff("childLock", "config"),
  };
  for (let index = 1; index <= count; index++) {
    controls[`switch_${index}`] = onOff(`switch${index}`);
  }
  for (let index = 1; index <= 6; index++) {
    controls[`switch_usb${index}`] = onOff(`usbSwitch${index}`);
  }
  return controls;
}

const PLUG_CONTROLS = switches(6);

// Source: What each code stands for in its category: hps in
// https://github.com/home-assistant/core/commit/e65345900ff22959492c9c32e46ec17308389a68,
// with on values added in https://github.com/home-assistant/core/commit/5eadfcc52439b352d84bb16856c4f6118e6c6a80
// and https://github.com/home-assistant/core/commit/4dbf3359c11a3a2d2c8eb5cb449ecf3ab066d9a5;
// mcs in https://github.com/home-assistant/core/commit/b2cef78d90ea06f3327181ec27cf178b794f7641,
// and its `switch`, which some contact sensors report the door by, in
// https://github.com/home-assistant/core/commit/e6df0be072b78961e6929a69154386ef79c962d4;
// pir in https://github.com/home-assistant/core/commit/892bf62dd579984e43439760bc3eb646cadb784b;
// and sj in https://github.com/home-assistant/core/commit/6d898a631ccafe700dd86145ff25e99dd5bbb66b,
// with the on value "1" added in
// https://github.com/home-assistant/core/commit/509add8e5ca7fb47e0c02a645c92861a989cf8c5.
const CATEGORY_CONTROLS: Readonly<
  Record<string, Readonly<Record<string, DescribeControl>>>
> = {
  cz: PLUG_CONTROLS,
  hps: {
    presence_state: detector("occupancy", "occupancy", [
      "presence",
      "small_move",
      "large_move",
      "peaceful",
    ]),
  },
  kg: switches(22),
  mcs: {
    doorcontact_state: detector("door", "door"),
    switch: detector("door", "door"),
  },
  pc: PLUG_CONTROLS,
  pir: { pir: detector("motion", "motion", ["pir"]) },
  sj: { watersensor_state: detector("moisture", "moisture", ["1", "alarm"]) },
};

// Source: wsdcg is the temperature and humidity sensor, in
// https://github.com/home-assistant/core/commit/35872a212b2340d3906557e5f644d99f7360ff15.
/** The categories of sensors, where an entry from `createDeviceEntry` reads
 * what the device is for, so it can go ahead of a match by data points alone.
 * It still leaves out a sensor's settings, such as a presence sensor's
 * sensitivity. In another category it leaves out what the device does, as a
 * plug's meter or a heater's set point. */
export const MODEL_CATEGORIES: readonly string[] = [
  "hps",
  "mcs",
  "pir",
  "sj",
  "wsdcg",
];

const DATA_POINT_TYPES = {
  boolean: "boolean",
  integer: "integer",
  enum: "string",
} as const;

/** Builds an entry from the codes of Tuya's standard instruction set a
 * device's model gives its data points, for a device whose product the
 * catalog does not list. A temperature, a humidity and a battery are read
 * in any category; a switch or a detector only in a category whose code for
 * it is known. Two data points that name one control, as `temp_current`
 * and `va_temperature` do, give it the first. A reading whose scale the model
 * does not give is left out, as its value would be off by a power of ten.
 * Resolves with undefined when
 * no data point is known. */
export function createDeviceEntry(
  model: TuyaDeviceModel,
  options: CreateDeviceEntryOptions,
): TuyaDeviceEntry | undefined {
  const categoryControls = Object.hasOwn(CATEGORY_CONTROLS, options.category)
    ? CATEGORY_CONTROLS[options.category]
    : {};
  const dataPoints: Record<string, TuyaDataPointSpec> = {};
  const controls: Record<string, TuyaControl> = {};
  for (const [id, dataPoint] of Object.entries(model)) {
    const describe = Object.hasOwn(categoryControls, dataPoint.code)
      ? categoryControls[dataPoint.code]
      : Object.hasOwn(READINGS, dataPoint.code)
        ? READINGS[dataPoint.code]
        : undefined;
    const described = describe?.(dataPoint);
    if (described === undefined || described.name in controls) {
      continue;
    }
    controls[described.name] = { dataPoint: id, ...described.control };
    dataPoints[id] = {
      type: DATA_POINT_TYPES[dataPoint.type as keyof typeof DATA_POINT_TYPES],
    };
  }
  if (Object.keys(controls).length === 0) {
    return undefined;
  }
  return {
    name: options.name,
    products: [],
    dataPoints,
    components: { device: controls },
  };
}
