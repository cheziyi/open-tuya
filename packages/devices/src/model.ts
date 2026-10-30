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
// or Fahrenheit, and `temp_current` in Celsius when it names none, in
// https://github.com/home-assistant/core/blob/806c553178c16f996cce6228b7f0db52fc61df8b/homeassistant/components/tuya/const.py#L46-L47
// and https://github.com/home-assistant/core/blob/806c553178c16f996cce6228b7f0db52fc61df8b/homeassistant/components/tuya/const.py#L958.
const CELSIUS_UNITS = new Set(["°c", "c", "celsius", "℃"]);
const FAHRENHEIT_UNITS = new Set(["°f", "f", "fahrenheit", "℉"]);

// Source: An integer is its value divided by 10 to the power of its scale, in
// https://github.com/tuya/tuya-openclaw-skills/blob/9f3c3bdb4d2063a285dd9a20d0cb4b5dae04e908/tuya-smart-control/references/device-control.md#L105.
function scaleOf(dataPoint: TuyaModelDataPoint): { scale?: number } {
  return dataPoint.scale ? { scale: 10 ** dataPoint.scale } : {};
}

function temperature(dataPoint: TuyaModelDataPoint): NamedControl | undefined {
  const unit = dataPoint.unit?.toLowerCase();
  const symbol =
    unit === undefined || CELSIUS_UNITS.has(unit)
      ? "C"
      : FAHRENHEIT_UNITS.has(unit)
        ? "F"
        : undefined;
  if (dataPoint.type !== "integer" || symbol === undefined) {
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
      ...scaleOf(dataPoint),
    },
  };
}

function percent(measures: Measure): DescribeControl {
  return (dataPoint) =>
    dataPoint.type === "integer" &&
    (dataPoint.unit === undefined || dataPoint.unit === "%")
      ? {
          name: `${measures}InPercent`,
          control: {
            kind: "sensor",
            measures,
            reading: "instant",
            readOnly: true,
            unit: "%",
            ...scaleOf(dataPoint),
          },
        }
      : undefined;
}

// Source: Home Assistant reads a binary sensor as on while its value is its
// `on_value`, true unless it names one, in
// https://github.com/home-assistant/core/blob/806c553178c16f996cce6228b7f0db52fc61df8b/homeassistant/components/tuya/binary_sensor.py#L37.
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
// category it lists them in: `temp_current` in 21 categories, as in
// https://github.com/home-assistant/core/blob/806c553178c16f996cce6228b7f0db52fc61df8b/homeassistant/components/tuya/sensor.py#L1606-L1644,
// and the battery's in every category through
// https://github.com/home-assistant/core/blob/806c553178c16f996cce6228b7f0db52fc61df8b/homeassistant/components/tuya/sensor.py#L222-L258.
const READINGS: Readonly<Record<string, DescribeControl>> = {
  temp_current: temperature,
  va_temperature: temperature,
  humidity_value: percent("humidity"),
  va_humidity: percent("humidity"),
  battery_percentage: percent("battery"),
  va_battery: percent("battery"),
};

// Source: A wall switch's gangs are switch_1 to switch_22, a power strip's
// and a plug's switch_1 to switch_6, beside switch_usb1 to switch_usb6, a
// switch and a child lock, in
// https://github.com/home-assistant/core/blob/806c553178c16f996cce6228b7f0db52fc61df8b/homeassistant/components/tuya/switch.py#L370-L420,
// https://github.com/home-assistant/core/blob/806c553178c16f996cce6228b7f0db52fc61df8b/homeassistant/components/tuya/switch.py#L510-L587
// and https://github.com/home-assistant/core/blob/806c553178c16f996cce6228b7f0db52fc61df8b/homeassistant/components/tuya/switch.py#L924.
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

// Source: What each code stands for in its category, in
// https://github.com/home-assistant/core/blob/806c553178c16f996cce6228b7f0db52fc61df8b/homeassistant/components/tuya/binary_sensor.py#L250-L256
// for hps, L281-L291 for mcs, whose `switch` some contact sensors report the
// door by, L317-L324 for pir and L354-L361 for sj.
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
 * and `va_temperature` do, give it the first. Resolves with undefined when
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
