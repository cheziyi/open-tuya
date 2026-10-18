import { parse, type Tags, YAMLParseError } from "yaml";
import type {
  ControlCondition,
  ControlDependency,
  ControlMapping,
  ControlRule,
  ControlTarget,
  ControlValue,
  TuyaControl,
  TuyaDataPointSpec,
  TuyaDataPointType,
  TuyaDeviceEntry,
} from "../src/entry.js";
import { pyStr } from "../src/python.ts";
import {
  type ControlKind,
  type ControlName,
  MEASURES,
  type Measure,
  type UnitSuffix,
} from "../src/vocabulary.ts";

interface DeviceFile {
  name: string;
  products?: { id?: string }[];
  entities: EntityConfig[];
}

interface EntityConfig {
  entity: string;
  name?: string;
  translation_key?: string;
  translation_only_key?: string;
  translation_placeholders?: Record<string, unknown>;
  class?: string;
  deprecated?: string;
  dps: DataPointConfig[];
}

interface DataPointConfig {
  id: number | string;
  name: string;
  type: string;
  optional?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  range?: { min?: number; max?: number };
  unit?: string;
  mapping?: MappingRule[];
  mask?: string;
  mask_signed?: boolean;
  endianness?: string;
  format?: FormatField[];
  /** The type the data point's first declaration gives, set as the file is
   * read. */
  specType?: string;
  [key: string]: unknown;
}

interface FormatField {
  name: string;
  bytes?: number;
  range?: { min?: number; max?: number };
}

interface MappingRule {
  dps_val?: unknown;
  value?: unknown;
  scale?: number;
  step?: number;
  invert?: boolean;
  target_range?: { min?: number; max?: number };
  hidden?: boolean;
  constraint?: string;
  conditions?: MappingRule[];
  mapping?: MappingRule[];
  range?: { min?: number; max?: number };
  value_redirect?: string;
  value_mirror?: string;
  available?: string;
  invalid?: boolean;
  default?: boolean;
  [key: string]: unknown;
}

export type Conversion =
  | { entry: Omit<TuyaDeviceEntry, "source"> }
  | { unsupported: string };

// A feature found while converting, which keeps the file out.
class UnsupportedFeature extends Error {}

class LoopingRedirect extends UnsupportedFeature {}

const RANGE_ON_RAW = "a mapping's own `range` on one raw value";
const DATA_POINT_TYPES: ReadonlySet<string> = new Set([
  "boolean",
  "integer",
  "string",
  "bitfield",
  "base64",
  "hex",
  "json",
  "unixtime",
  "utf16b64",
]);
const NUMBER_CONVERSIONS = ["scale", "step", "invert", "target_range"];
const PACKED_TYPES: ReadonlySet<string> = new Set(["base64", "hex"]);
// The types tuya-local reads as text.
const STRING_TYPES: ReadonlySet<string> = new Set([
  "base64",
  "hex",
  "json",
  "string",
  "utf16b64",
]);
const MASKED_TYPES: ReadonlySet<string> = new Set([
  "base64",
  "bitfield",
  "hex",
  "integer",
]);
// Source: A format field of 1, 2 or 4 bytes unpacks as a number, and one of
// 3 bytes as bytes, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L49-L71.
const FORMAT_FIELD_BYTES: ReadonlySet<number> = new Set([1, 2, 4]);
const NUMBER_TYPES: ReadonlySet<string> = new Set([
  "bitfield",
  "integer",
  "unixtime",
]);

// Entities that group several data points into one part of a device.
const COMPOSITE_ENTITIES: ReadonlySet<string> = new Set([
  "alarm_control_panel",
  "camera",
  "climate",
  "cover",
  "fan",
  "humidifier",
  "infrared",
  "lawn_mower",
  "light",
  "lock",
  "media_player",
  "remote",
  "siren",
  "vacuum",
  "valve",
  "water_heater",
]);

// The data point an entity of one data point is about.
const PRIMARY_DATA_POINTS: Record<string, string> = {
  binary_sensor: "sensor",
  button: "button",
  datetime: "value",
  event: "event",
  number: "value",
  select: "option",
  sensor: "sensor",
  switch: "switch",
  text: "value",
};

// Translation keys that say what Home Assistant offers for an entity, not
// which part of the device it is.
const CAPABILITY_KEYS: ReadonlySet<string> = new Set([
  "aircon_extra",
  "extended",
  "fan_with_presets",
  "swing_as_powerlevel",
]);

// A control's name for a composite entity's data point, by entity and
// tuya-local's name for the data point. Any other data point keeps its own
// name.
const COMPOSITE_CONTROLS: Record<string, ControlName> = {
  "light.switch": "on",
  "light.brightness": "brightness",
  "light.color_temp": "colorTemperature",
  "light.rgbhsv": "color",
  "light.named_color": "colorName",
  "light.color_mode": "colorMode",
  "light.effect": "effect",
  "climate.hvac_mode": "hvacMode",
  "climate.hvac_action": "hvacAction",
  "climate.temperature": "targetTemperature",
  "climate.current_temperature": "currentTemperature",
  "climate.target_temp_low": "heatingTargetTemperature",
  "climate.target_temp_high": "coolingTargetTemperature",
  "climate.min_temperature": "minimumTargetTemperature",
  "climate.min_temp": "minimumTargetTemperature",
  "climate.max_temp": "maximumTargetTemperature",
  "climate.temp_set": "targetTemperature",
  "climate.temp_current": "currentTemperature",
  "climate.temp_cur": "currentTemperature",
  "climate.current_temp": "currentTemperature",
  "climate.cur_temp": "currentTemperature",
  "climate.max_temperature": "maximumTargetTemperature",
  "climate.temperature_unit": "temperatureUnit",
  "climate.preset_mode": "preset",
  "climate.fan_mode": "fanMode",
  "climate.swing_mode": "swingMode",
  "climate.swing_horizontal_mode": "horizontalSwingMode",
  "climate.humidity": "targetHumidity",
  "climate.current_humidity": "currentHumidity",
  "water_heater.operation_mode": "mode",
  "water_heater.temperature": "targetTemperature",
  "water_heater.current_temperature": "currentTemperature",
  "water_heater.min_temperature": "minimumTargetTemperature",
  "water_heater.max_temperature": "maximumTargetTemperature",
  "water_heater.temperature_unit": "temperatureUnit",
  "water_heater.away_mode": "awayMode",
  "fan.switch": "on",
  "fan.speed": "speed",
  "fan.preset_mode": "preset",
  "fan.oscillate": "oscillating",
  "fan.direction": "direction",
  "humidifier.switch": "on",
  "humidifier.humidity": "targetHumidity",
  "humidifier.current_humidity": "currentHumidity",
  "humidifier.mode": "mode",
  "humidifier.action": "action",
  "cover.control": "command",
  "cover.position": "targetPosition",
  "cover.current_position": "currentPosition",
  "cover.tilt_position": "targetTilt",
  "cover.action": "movement",
  "lock.lock": "locked",
  "lock.lock_state": "lockState",
  "valve.valve": "open",
  "valve.current_position": "currentPosition",
  "vacuum.power": "on",
  "vacuum.activate": "cleaning",
  "vacuum.command": "command",
  "vacuum.direction_control": "moveDirection",
  "vacuum.fan_speed": "suction",
  "siren.switch": "on",
  "siren.volume_level": "volume",
  "camera.switch": "on",
  "camera.motion_enable": "motionDetection",
  "camera.record": "recording",
  "media_player.switch": "on",
};

// Source: A `default` rule gives the value written when a command names
// none, to the siren's tone, the light's effect and colour mode, and the water
// heater's operation mode alone, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/siren.py#L81-L99,
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/light.py#L473-L482,
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/light.py#L568-L587
// and https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/water_heater.py#L229-L243.
// Every other entity ignores it.
const DEFAULT_VALUE_DATA_POINTS: ReadonlySet<string> = new Set([
  "siren.tone",
  "light.effect",
  "light.color_mode",
  "water_heater.operation_mode",
]);

// A control's name for an entity of one data point, by entity and its
// translation key or, with no name or key, its class.
const SIMPLE_CONTROLS: Record<string, ControlName> = {
  "switch/": "on",
  "lock/child_lock": "childLock",
  "switch/camera_record": "recording",
  "binary_sensor/class:problem": "fault",
  "sensor/class:temperature": "temperature",
  "sensor/class:humidity": "humidity",
  "sensor/class:battery": "battery",
  "sensor/class:power": "power",
  "sensor/class:energy": "energy",
  "sensor/class:voltage": "voltage",
  "sensor/class:current": "current",
};

// Source: A climate entity's temperatures share one unit: the one its unit
// data point reports, or else the first of these data points that names one,
// or else Celsius, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/climate.py#L127-L156.
const TEMPERATURE_UNIT_DATA_POINTS = [
  "temperature",
  "target_temp_high",
  "target_temp_low",
  "current_temperature",
];

// Source: tuya-local names a temperature unit select's options celsius and
// fahrenheit, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/translations/en.json#L880-L886,
// and reads C and F as °C and °F, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/entity.py#L143-L148.
// A control another reads its unit from gives the catalog's symbol for each.
const UNIT_SYMBOLS: Record<string, string> = {
  celsius: "C",
  fahrenheit: "F",
  "°C": "C",
  "°F": "F",
  "℃": "C",
};
const TEMPERATURE_UNITS: ReadonlySet<string> = new Set(["C", "F", "K"]);

function unitSymbol<T>(value: T): T | string {
  return typeof value === "string" ? (UNIT_SYMBOLS[value] ?? value) : value;
}

// Home Assistant takes a climate or humidifier entity's humidity as a
// percentage, whatever its data point says.
const HUMIDITY_CONTROLS: ReadonlySet<string> = new Set<ControlName>([
  "currentHumidity",
  "targetHumidity",
]);

// The control a data point is read-only on, besides a sensor's: what a device
// measures or reports.
const READ_ONLY_CONTROLS: ReadonlySet<string> = new Set<ControlName>([
  "action",
  "currentHumidity",
  "currentPosition",
  "currentTemperature",
  "hvacAction",
  "lockState",
  "movement",
]);

// Source: A lock reads these data points, and never writes them, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/lock.py#L74-L96.
const READ_ONLY_DATA_POINTS: ReadonlySet<string> = new Set([
  "lock.jammed",
  "lock.request_intercom",
  "lock.request_unlock",
  "lock.unlock_app",
  "lock.unlock_ble",
  "lock.unlock_card",
  "lock.unlock_dynamic_pwd",
  "lock.unlock_face",
  "lock.unlock_fingerprint",
  "lock.unlock_ibeacon",
  "lock.unlock_key",
  "lock.unlock_multi",
  "lock.unlock_offline_pwd",
  "lock.unlock_password",
  "lock.unlock_temp_pwd",
  "lock.unlock_voice",
]);

const READ_ONLY_ENTITIES: ReadonlySet<string> = new Set([
  "binary_sensor",
  "event",
  "sensor",
]);

// A light's colour field, by tuya-local's name for it. Any other field is
// named for its data point and its own name.
const COLOR_FIELDS: Record<string, ControlName> = {
  h: "hue",
  s: "saturation",
  v: "colorBrightness",
  r: "red",
  g: "green",
  b: "blue",
};

// Source: A switch or a binary sensor is on while its data point's value is
// truthy, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/switch.py#L58-L63,
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/binary_sensor.py#L64-L66
// and https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/light.py#L154-L157,
// so masked bits with no mapping read as a boolean.
const BOOLEAN_DATA_POINTS: ReadonlySet<string> = new Set([
  "binary_sensor.sensor",
  "switch",
]);

// The kind of control an entity of one data point is, by entity.
const SIMPLE_KINDS: Record<string, ControlKind> = {
  binary_sensor: "sensor",
  button: "button",
  datetime: "text",
  event: "event",
  lock: "switch",
  number: "number",
  select: "select",
  sensor: "sensor",
  switch: "switch",
  text: "text",
  time: "number",
};

// The entities whose class says what they measure or detect.
const MEASURING_ENTITIES: ReadonlySet<string> = new Set([
  "binary_sensor",
  "number",
  "sensor",
]);

// Classes that say nothing of what is measured.
const UNMEASURED_CLASSES: ReadonlySet<string> = new Set([
  "enum",
  "measurement",
]);

// What a composite entity's control measures, by its name.
const COMPOSITE_MEASURES: Partial<Record<ControlName, Measure>> = {
  coolingTargetTemperature: "temperature",
  currentHumidity: "humidity",
  currentTemperature: "temperature",
  heatingTargetTemperature: "temperature",
  maximumTargetTemperature: "temperature",
  minimumTargetTemperature: "temperature",
  targetHumidity: "humidity",
  targetTemperature: "temperature",
};

// The unit a time entity's data point carries, by its name.
const TIME_UNITS: Record<string, string> = {
  hour: "h",
  minute: "min",
  second: "s",
};

const TIME_SUFFIXES: ReadonlySet<string> = new Set<UnitSuffix>([
  "Days",
  "Hours",
  "Minutes",
  "Ms",
  "Seconds",
]);

// Units that count something, which a name does not spell as a unit: a
// count of uses, a valve's steps or pulses, a zoom factor.
const COUNTED_UNITS: ReadonlySet<string> = new Set([
  "cleanings",
  "controllers",
  "cycles",
  "doses",
  "leds",
  "P",
  "pulse",
  "step",
  "times",
  "uses",
  "visits",
  "x",
  "X",
]);

// Name suffixes for the units tuya-local writes most: AGENTS.md spells a unit
// after `In`, abbreviating only where the abbreviation is well known.
const UNIT_SUFFIXES: Record<string, UnitSuffix> = {
  C: "C",
  "°C": "C",
  "℃": "C",
  F: "F",
  "°F": "F",
  K: "K",
  "%": "Percent",
  s: "Seconds",
  min: "Minutes",
  minutes: "Minutes",
  h: "Hours",
  hour: "Hours",
  d: "Days",
  days: "Days",
  ms: "Ms",
  V: "V",
  v: "V",
  mV: "Millivolts",
  mv: "Millivolts",
  A: "A",
  mA: "Milliamps",
  W: "W",
  kW: "Kw",
  Wh: "Wh",
  kWh: "Kwh",
  Hz: "Hz",
  ppm: "Ppm",
  ppb: "Ppb",
  lx: "Lux",
  ugm3: "UgPerM3",
  "µg/m³": "UgPerM3",
  "μg/m³": "UgPerM3",
  Ω: "Ohms",
  portions: "Portions",
};

// Source: tuya-local reads its device files with PyYAML, as YAML 1.1, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L101-L109.
// These are PyYAML's resolvers where the yaml library's YAML 1.1 schema
// differs: no y or n as a boolean, a float only with a dot, and no decimal
// integer with a leading zero.
const PYYAML_TESTS: Record<string, RegExp> = {
  true: /^(?:yes|Yes|YES|true|True|TRUE|on|On|ON)$/,
  false: /^(?:no|No|NO|false|False|FALSE|off|Off|OFF)$/,
  float:
    /^(?:[-+]?[0-9][0-9_]*\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?)$/,
  int: /^[-+]?(?:0|[1-9][0-9_]*)$/,
};

function pyYamlTags(tags: Tags): Tags {
  return tags.flatMap((tag) => {
    if (typeof tag === "string" || !("test" in tag) || !tag.test) {
      return [tag];
    }
    if (tag.tag === "tag:yaml.org,2002:bool") {
      const value = tag.test.test("true") ? "true" : "false";
      return [{ ...tag, test: PYYAML_TESTS[value] }];
    }
    if (tag.tag === "tag:yaml.org,2002:float" && tag.format === "EXP") {
      return [];
    }
    if (
      tag.tag === "tag:yaml.org,2002:float" &&
      !tag.format &&
      !tag.test.test(".nan")
    ) {
      return [{ ...tag, test: PYYAML_TESTS.float }];
    }
    if (tag.tag === "tag:yaml.org,2002:int" && !tag.format) {
      return [{ ...tag, test: PYYAML_TESTS.int }];
    }
    return [tag];
  }) as Tags;
}

/** Parses a device file as tuya-local does. An integer too large for a
 * JavaScript number stays a bigint. */
function parseDeviceFile(text: string): unknown {
  return toSafeNumbers(
    parse(text, {
      version: "1.1",
      customTags: pyYamlTags,
      intAsBigInt: true,
    }),
  );
}

function toSafeNumbers(value: unknown): unknown {
  if (typeof value === "bigint") {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : value;
  }
  if (Array.isArray(value)) {
    return value.map(toSafeNumbers);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toSafeNumbers(item)]),
    );
  }
  return value;
}

/** Converts one tuya-local device file, or names the feature it uses that
 * the catalog does not convert. */
export function convertDeviceFile(text: string): Conversion {
  let file: DeviceFile;
  try {
    file = parseDeviceFile(text) as DeviceFile;
  } catch (error) {
    if (error instanceof YAMLParseError) {
      return { unsupported: "not valid YAML" };
    }
    throw error;
  }
  const reason = unsupportedFeature(file);
  if (reason) {
    return { unsupported: reason };
  }
  // Source: Each declaration of a data point reads it as its own type, in
  // https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L408-L428.
  const specTypes = new Map<string, string>();
  for (const dp of file.entities.flatMap((entity) => entity.dps)) {
    if (!specTypes.has(String(dp.id))) {
      specTypes.set(String(dp.id), dp.type);
    }
    dp.specType = specTypes.get(String(dp.id));
  }
  try {
    return {
      entry: {
        name: file.name,
        productKeys: (file.products ?? []).flatMap((product) =>
          product.id ? [String(product.id)] : [],
        ),
        dataPoints: dataPointSpecs(file),
        components: components(file),
      },
    };
  } catch (error) {
    if (error instanceof UnsupportedFeature) {
      return { unsupported: error.message };
    }
    throw error;
  }
}

function unsupportedFeature(file: DeviceFile): string | undefined {
  const reasons = new Set<string>();
  for (const entity of file.entities) {
    for (const dp of entity.dps) {
      if (!DATA_POINT_TYPES.has(dp.type)) {
        reasons.add(`\`${dp.type}\`: a data point of that type`);
      }
      const reason = unsupportedPacking(entity, dp);
      if (reason) {
        reasons.add(reason);
      }
      const rules = dp.mapping ?? [];
      for (const rule of rules) {
        for (const reason of unsupportedRule(entity, dp, rule)) {
          reasons.add(reason);
        }
      }
    }
  }
  return [...reasons].sort()[0];
}

function unsupportedRule(
  entity: EntityConfig,
  dp: DataPointConfig,
  rule: MappingRule,
): string[] {
  const reasons: string[] = [];
  const conditions = rule.conditions ?? [];
  // A rule that redirects reads and writes through the other data point: its
  // own range only stands in for the other's, see redirectTarget, and its
  // step sizes Home Assistant's slider alone.
  const onRaw = "dps_val" in rule && rule.value_redirect === undefined;
  // Source: A write rounds to a rule's step only a raw value that is a
  // number, in
  // https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L1094-L1099,
  // and otherwise the step is read as the size of Home Assistant's slider
  // alone, in
  // https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L706-L723.
  // On a string raw value it is presentation, and convertDataPoint drops it.
  if (
    onRaw &&
    NUMBER_CONVERSIONS.some(
      (key) =>
        key in rule && !(key === "step" && typeof rule.dps_val === "string"),
    )
  ) {
    reasons.push("a number conversion on one raw value");
  }
  if (onRaw && "range" in rule) {
    reasons.push(RANGE_ON_RAW);
  }
  if (!onRaw && "range" in rule && (rule.invert || rule.target_range)) {
    reasons.push("a mapping's own `range` beside `invert` or `target_range`");
  }
  if (conditions.length === 0) {
    return reasons;
  }
  const constraint = entity.dps.find(
    (candidate) => candidate.name === (rule.constraint ?? dp.name),
  );
  if (!constraint) {
    reasons.push("a `constraint` the entity lacks");
  } else if (convertsConstraint(constraint) && canWrite(entity, constraint)) {
    reasons.push(
      "a `constraint` read through a mask or a mapping that can be written",
    );
  }
  for (const condition of conditions) {
    if ("conditions" in condition || "constraint" in condition) {
      reasons.push("conditions inside a condition");
    }
    const redirects = condition.value_redirect !== undefined;
    if (
      "dps_val" in rule &&
      !redirects &&
      NUMBER_CONVERSIONS.some((key) => key in condition)
    ) {
      reasons.push("a number conversion on one raw value");
    }
    if ("dps_val" in rule && !redirects && "range" in condition) {
      reasons.push(RANGE_ON_RAW);
    }
  }
  return reasons;
}

// Source: A format is unpacked from the bytes a hex or base64 value decodes
// to, and a value of any other type is not decoded, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L519-L546,
// so a format on it is dropped.
function hasFormat(
  dp: DataPointConfig,
): dp is DataPointConfig & { format: FormatField[] } {
  return dp.format !== undefined && PACKED_TYPES.has(dp.type);
}

function canWrite(entity: EntityConfig, dp: DataPointConfig): boolean {
  return !dp.readonly && !READ_ONLY_ENTITIES.has(entity.entity);
}

// Source: A condition matches a hex or base64 constraint by its value as it
// converts, and any other by its raw value, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L933-L976.
// Only a mask or a mapping makes the two differ.
function convertsConstraint(constraint: DataPointConfig): boolean {
  return (
    PACKED_TYPES.has(constraint.type) &&
    (constraint.mask !== undefined || constraint.mapping !== undefined)
  );
}

function unsupportedPacking(
  entity: EntityConfig,
  dp: DataPointConfig,
): string | undefined {
  if (hasFormat(dp)) {
    if (entity.entity !== "light") {
      return "`format` outside a light";
    }
    if (dp.format.some((field) => !FORMAT_FIELD_BYTES.has(field.bytes ?? 1))) {
      return "a `format` field of other than 1, 2 or 4 bytes";
    }
  }
  if (
    dp.endianness !== undefined &&
    !["big", "little"].includes(dp.endianness)
  ) {
    return "an `endianness` other than big or little";
  }
  if (dp.mask === undefined || !isControl(dp)) {
    return undefined;
  }
  if (typeof dp.mask !== "string" || !/^[0-9A-Fa-f]+$/.test(dp.mask)) {
    return "a `mask` that is not a string of hex digits";
  }
  if (!MASKED_TYPES.has(dp.type)) {
    return "`mask` on a data point that is not hex, base64 or an integer";
  }
  const writable = canWrite(entity, dp);
  if (writable && dp.mask.length % 2 !== 0) {
    return "a `mask` of an odd number of hex digits on a control that can be written";
  }
  return undefined;
}

function dataPointSpecs(file: DeviceFile): Record<string, TuyaDataPointSpec> {
  const specs: Record<string, TuyaDataPointSpec> = {};
  const required = new Set<string>();
  for (const entity of file.entities) {
    for (const dp of entity.dps) {
      const id = String(dp.id);
      if (!dp.optional) {
        required.add(id);
      }
      const type = dp.type as TuyaDataPointType;
      const spec = specs[id] ?? { type };
      specs[id] = spec;
      if (type !== spec.type && !spec.otherTypes?.includes(type)) {
        spec.otherTypes = [...(spec.otherTypes ?? []), type];
      }
    }
  }
  for (const [id, spec] of Object.entries(specs)) {
    if (!required.has(id)) {
      spec.optional = true;
    }
  }
  return Object.fromEntries(
    Object.entries(specs).sort(([a], [b]) => Number(a) - Number(b)),
  );
}

// A control before its name is settled, by the name it asks for: several
// can ask for one, see settle.
interface Candidate {
  /** The name before its unit. */
  base: string;
  /** The unit the name spells, where it spells one. */
  unit?: string;
  control: TuyaControl;
  entity: EntityConfig;
  composite: boolean;
  /** An extra data point of its entity, which tuya-local shows as an
   * attribute, not one the entity acts on. */
  attribute: boolean;
}

type Draft = Record<string, Candidate[]>;

function isComposite(entity: EntityConfig): boolean {
  return (
    COMPOSITE_ENTITIES.has(entity.entity) &&
    !(entity.entity === "lock" && entity.translation_key === "child_lock")
  );
}

function components(
  file: DeviceFile,
): Record<string, Record<string, TuyaControl>> {
  const entities = file.entities.filter((entity) => !entity.deprecated);
  const main = entities.find(
    (entity) => isComposite(entity) && !entity.name && !entity.translation_key,
  );
  const drafts: Record<string, Draft> = {};
  const mainName = main ? camelCase(main.entity) : "device";
  const unitSelect = entities.some(
    (entity) =>
      entity.entity === "select" &&
      entity.translation_key === "temperature_unit",
  );
  const componentNames = nameComponents(
    entities.filter((entity) => isComposite(entity) && entity !== main),
    mainName,
  );
  for (const entity of entities) {
    const componentName = componentNames.get(entity) ?? mainName;
    drafts[componentName] ??= {};
    const draft = drafts[componentName];
    if (isComposite(entity)) {
      addCompositeControls(draft, entity, unitSelect && entity === main);
    } else {
      addSimpleControls(draft, entity, entities);
    }
  }
  for (const draft of Object.values(drafts)) {
    for (const [name, candidates] of Object.entries(draft)) {
      draft[name] = mergeDataPoints(draft, name, candidates);
    }
  }
  if (main) {
    leaveMain(drafts, mainName);
  }
  const result: Record<string, Record<string, TuyaControl>> = {};
  for (const [name, draft] of Object.entries(drafts)) {
    const controls = settle(draft);
    if (Object.keys(controls).length > 0) {
      result[name] = controls;
    }
  }
  nameUnits(result);
  return result;
}

// A control another reads its unit from, which passes its raw value on,
// takes the temperature units another control of the file maps the same
// data point to: a kettle's quick-set unit passes on `c`, which its climate
// maps to C. What it writes stays as it was.
function nameUnits(
  components: Record<string, Record<string, TuyaControl>>,
): void {
  const all = Object.values(components).flatMap((controls) =>
    Object.values(controls),
  );
  for (const controls of Object.values(components)) {
    for (const control of Object.values(controls)) {
      const unit = control.unitFrom && controls[control.unitFrom];
      if (
        !control.unitFrom ||
        !unit ||
        unit.values ||
        unit.otherwise !== undefined ||
        !isPlain(unit)
      ) {
        continue;
      }
      const source = all.find(
        (other) =>
          other.dataPoint === unit.dataPoint &&
          isPlain(other) &&
          other.type === unit.type &&
          (other.values ?? []).length > 0 &&
          (other.values ?? []).every((mapping) =>
            TEMPERATURE_UNITS.has(String(unitSymbol(mapping.value))),
          ),
      );
      if (source?.values) {
        controls[control.unitFrom] = {
          ...unit,
          kind: unit.readOnly ? unit.kind : "select",
          values: source.values.map(({ raw, value }) => ({
            raw,
            value: unitSymbol(value),
          })),
        };
      }
    }
  }
}

// Two entities that expose one data point, as a climate's unit and a select
// for it, give it one control: the one ranked first below, which takes the
// writes of the other where it can do so exactly (see absorb).
function mergeDataPoints(
  draft: Draft,
  name: string,
  candidates: readonly Candidate[],
): Candidate[] {
  // A mask makes its bits a value of their own.
  const byValue = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const { dataPoint, mask } = candidate.control;
    const key = `${dataPoint}/${mask ?? ""}`;
    byValue.set(key, [...(byValue.get(key) ?? []), candidate]);
  }
  // A control another of its entity reads its unit from.
  const isUnit = Object.values(draft).some((others) =>
    others.some((other) => other.control.unitFrom === name),
  );
  const givesUnit = (candidate: Candidate) =>
    Object.values(draft).some((others) =>
      others.some(
        (other) =>
          other.entity === candidate.entity && other.control.unitFrom === name,
      ),
    );
  const rank = (candidate: Candidate) => [
    candidate.attribute ? 0 : 1,
    candidate.composite ? 1 : 0,
    givesUnit(candidate) ? 1 : 0,
    candidate.control.readOnly ? 0 : 1,
    candidate.control.values?.length ?? 0,
  ];
  return [...byValue.values()].map((group) => {
    const kept = group.reduce((best, candidate) => {
      const [a, b] = [rank(best), rank(candidate)];
      const index = a.findIndex((value, at) => value !== b[at]);
      return index !== -1 && (b[index] ?? 0) > (a[index] ?? 0)
        ? candidate
        : best;
    });
    return {
      ...kept,
      control: group
        .filter((candidate) => candidate !== kept)
        .reduce(
          (control, other) => absorb(control, other, isUnit),
          kept.control,
        ),
    };
  });
}

// The fields of a control that converts a raw value by its mappings and
// `otherwise` alone.
const PLAIN_FIELDS: ReadonlySet<string> = new Set([
  "dataPoint",
  "type",
  "kind",
  "measures",
  "readOnly",
  "unit",
  "unitFrom",
  "values",
  "otherwise",
  "whenAbsent",
]);

function isPlain(control: TuyaControl): boolean {
  return (
    Object.keys(control).every((key) => PLAIN_FIELDS.has(key)) &&
    (control.values ?? []).every((mapping) =>
      Object.keys(mapping).every((key) => key === "raw" || key === "value"),
    )
  );
}

// The kept control takes the writes of another entity's control: each raw
// value the other writes, and the kept control cannot, maps to the kept
// control's reading of it. A sensor's unit, F for f and C for anything else,
// beside a select writing c for celsius, then writes c for C. The kept
// control's reads stay as they were, and where it was read-only, a mapping
// the other never writes stays so. Where that would not be exact, as where
// two raw values read alike, the kept control stays as it was. An attribute
// gives no writes: tuya-local never writes one.
function absorb(
  kept: TuyaControl,
  other: Candidate,
  isUnit: boolean,
): TuyaControl {
  if (other.attribute || other.control.readOnly) {
    return kept;
  }
  const keptValues = kept.values ?? [];
  const otherWrites = (other.control.values ?? []).filter(
    (mapping) => !mapping.readOnly && mapping.value != null,
  );
  const written = otherWrites.map((mapping) => mapping.raw);
  // A unit the kept control reads a raw value as only by passing it on, or
  // by `otherwise`, gives way to the unit the other names for it: a
  // climate's unit passes on `c`, which its select names celsius.
  const unitOf = (raw: ControlMapping["raw"]) => {
    const meant = unitSymbol(
      otherWrites.find((mapping) => mapping.raw === raw)?.value,
    );
    const read = kept.otherwise === undefined ? raw : kept.otherwise;
    return isUnit &&
      typeof meant === "string" &&
      TEMPERATURE_UNITS.has(meant) &&
      meant !== read &&
      !keptValues.some((mapping) => mapping.raw === raw)
      ? meant
      : undefined;
  };
  // A raw value no mapping names, and no mapping reads as, is written as it
  // is by a control without `otherwise`.
  const writable = (raw: ControlMapping["raw"]) =>
    keptValues.some((mapping) => mapping.raw === raw && !mapping.readOnly) ||
    (kept.otherwise === undefined &&
      !keptValues.some(
        (mapping) => mapping.raw === raw || mapping.value === raw,
      ));
  const missing = written.filter(
    (raw) => !writable(raw) || unitOf(raw) !== undefined,
  );
  if (
    (!kept.readOnly && missing.length === 0) ||
    !isPlain(kept) ||
    !isPlain(other.control) ||
    kept.type !== other.control.type
  ) {
    return kept;
  }
  const values: ControlMapping[] = [
    ...keptValues.map((mapping) =>
      kept.readOnly && !written.includes(mapping.raw)
        ? { ...mapping, readOnly: true as const }
        : mapping,
    ),
    ...missing.map((raw) => ({
      raw,
      value:
        unitOf(raw) ?? (kept.otherwise === undefined ? raw : kept.otherwise),
    })),
  ];
  const writes = values
    .filter((mapping) => !mapping.readOnly)
    .map((mapping) => mapping.value);
  if (writes.includes(null) || new Set(writes).size !== writes.length) {
    return kept;
  }
  const { readOnly: _, ...rest } = kept;
  return {
    ...rest,
    kind: kept.readOnly
      ? other.control.kind
      : values.length > 0
        ? "select"
        : kept.kind,
    ...(values.length > 0 && { values }),
    ...(kept.readOnly &&
      kept.otherwise !== undefined && { ownRuleReadOnly: true as const }),
  };
}

// An entity that joins the main component, but asks for a name a control of
// the main entity holds, goes to a component of the device's own instead:
// an aroma diffuser's switch beside its light's.
function leaveMain(drafts: Record<string, Draft>, mainName: string): void {
  const main = drafts[mainName] ?? {};
  const leaving = new Set<EntityConfig>();
  for (const candidates of Object.values(main)) {
    if (
      candidates.length > 1 &&
      candidates.some((candidate) => candidate.composite)
    ) {
      for (const candidate of candidates) {
        if (!candidate.composite) {
          leaving.add(candidate.entity);
        }
      }
    }
  }
  if (leaving.size === 0) {
    return;
  }
  const device: Draft = {};
  for (const [name, candidates] of Object.entries(main)) {
    const staying = candidates.filter(
      (candidate) => !leaving.has(candidate.entity),
    );
    const left = candidates.filter((candidate) =>
      leaving.has(candidate.entity),
    );
    if (left.length > 0) {
      device[name] = left;
    }
    if (staying.length > 0) {
      main[name] = staying;
    } else {
      delete main[name];
    }
  }
  drafts[unique(drafts, "device")] = device;
}

// Names each control of a component. A name distinguish leaves shared goes
// to an entity's own data point before an attribute, then to the first in
// the file, and the rest take an ordinal.
function settle(draft: Draft): Record<string, TuyaControl> {
  const named = Object.entries(draft).flatMap(([name, candidates]) =>
    candidates.length === 1 && candidates[0]
      ? [{ name, candidate: candidates[0] }]
      : distinguish(name, candidates, draft),
  );
  const holders = new Set<Candidate>();
  for (const name of new Set(named.map((item) => item.name))) {
    const [holder] = named
      .filter((item) => item.name === name)
      .sort(
        (a, b) => Number(a.candidate.attribute) - Number(b.candidate.attribute),
      );
    if (holder) {
      holders.add(holder.candidate);
    }
  }
  const finalNames = new Map<Candidate, string>();
  const taken: Record<string, true> = {};
  for (const item of named) {
    if (item.name in draft && holders.has(item.candidate)) {
      finalNames.set(item.candidate, item.name);
      taken[item.name] = true;
    }
  }
  for (const pass of [true, false]) {
    for (const item of named) {
      if (
        !finalNames.has(item.candidate) &&
        holders.has(item.candidate) === pass
      ) {
        const name = unique(taken, item.name);
        finalNames.set(item.candidate, name);
        taken[name] = true;
      }
    }
  }
  const controls: Record<string, TuyaControl> = {};
  for (const { candidate } of named) {
    const name = finalNames.get(candidate) ?? "";
    const unitFrom = candidate.control.unitFrom;
    const unitHolder =
      unitFrom === undefined
        ? undefined
        : (draft[unitFrom]?.find(
            (other) => other.entity === candidate.entity,
          ) ?? draft[unitFrom]?.[0]);
    const unitName = unitHolder && finalNames.get(unitHolder);
    controls[name] =
      unitName && unitName !== unitFrom
        ? { ...candidate.control, unitFrom: unitName }
        : candidate.control;
  }
  for (const unitFrom of new Set(
    Object.values(controls).map((control) => control.unitFrom),
  )) {
    const unit = unitFrom === undefined ? undefined : controls[unitFrom];
    if (unitFrom !== undefined && unit) {
      controls[unitFrom] = unitSymbols(unit);
    }
  }
  return controls;
}

function unitSymbols(control: TuyaControl): TuyaControl {
  const { values, otherwise } = control;
  return {
    ...control,
    ...(values && {
      values: values.map((mapping) => ({
        ...mapping,
        value: unitSymbol(mapping.value),
      })),
    }),
    ...(otherwise !== undefined && { otherwise: unitSymbol(otherwise) }),
  };
}

// Words that tell a control from another of its name by the kind of each: a
// number set beside the reading of its name is its setting, which can be a
// set point, a threshold or an amount alike; a switch beside another kind of
// control turns that feature on; a text beside a select or a number holds
// the raw data of what they choose; and a reading beside a button or a
// select is the state they act on, as `lockState`.
function byKind(
  candidate: Candidate,
  rivals: readonly Candidate[],
): string | undefined {
  const { kind, readOnly } = candidate.control;
  const kinds = new Set(rivals.map((rival) => rival.control.kind));
  if (
    kind === "number" &&
    !readOnly &&
    rivals.some((rival) => rival.control.readOnly)
  ) {
    return join(candidate.base, "setting");
  }
  if (kind === "switch" && [...kinds].some((other) => other !== "switch")) {
    return join(candidate.base, "enabled");
  }
  if (kind === "text" && (kinds.has("select") || kinds.has("number"))) {
    return join(candidate.base, "data");
  }
  if (kind === "sensor" && (kinds.has("button") || kinds.has("select"))) {
    return join(candidate.base, "state");
  }
  return undefined;
}

// A reading whose class its rivals do not share, and its name does not say,
// takes the class's word: a doorbell's connectivity beside its ring.
function byMeasure(
  candidate: Candidate,
  rivals: readonly Candidate[],
): string | undefined {
  const { measures } = candidate.control;
  if (
    !measures ||
    rivals.some((rival) => rival.control.measures === measures) ||
    candidate.base.toLowerCase().includes(measures.toLowerCase())
  ) {
    return undefined;
  }
  return candidate.base + measures.charAt(0).toUpperCase() + measures.slice(1);
}

// Tells apart controls of different values that ask for one name, by byKind
// and then byMeasure. A name another control of the component asks for
// tells nothing apart.
function distinguish(
  name: string,
  candidates: readonly Candidate[],
  draft: Draft,
): { name: string; candidate: Candidate }[] {
  let names = candidates.map(() => name);
  for (const qualify of [byKind, byMeasure]) {
    const current = names;
    names = candidates.map((candidate, index) => {
      const own = current[index] ?? name;
      const rivals = candidates.filter(
        (_, other) => other !== index && current[other] === own,
      );
      const base = rivals.length > 0 ? qualify(candidate, rivals) : undefined;
      const qualified =
        base === undefined || candidate.unit === undefined
          ? base
          : controlName(base, candidate.unit);
      return qualified === undefined || qualified in draft ? own : qualified;
    });
  }
  return candidates.map((candidate, index) => ({
    name: names[index] ?? name,
    candidate,
  }));
}

function addCompositeControls(
  draft: Draft,
  entity: EntityConfig,
  unitSelect: boolean,
): void {
  const runtimeUnit =
    (entity.entity === "climate" || entity.entity === "water_heater") &&
    (unitSelect || entity.dps.some((dp) => dp.name === "temperature_unit"));
  const temperatureUnit = TEMPERATURE_UNIT_DATA_POINTS.map(
    (name) => entity.dps.find((dp) => dp.name === name)?.unit,
  ).find((unit) => unit !== undefined);
  for (const dp of entity.dps) {
    if (!isControl(dp) || isShadowed(entity, dp)) {
      continue;
    }
    if (hasFormat(dp)) {
      addFormatControls(draft, entity, dp, dp.format);
      continue;
    }
    const named = splitUnit(dp);
    const base =
      COMPOSITE_CONTROLS[`${entity.entity}.${named.name}`] ??
      camelCase(named.name);
    const temperature =
      /temperature$/i.test(base) && !/colorTemperature$/i.test(base);
    const unitFrom =
      runtimeUnit && temperature && named.unit === undefined
        ? "temperatureUnit"
        : undefined;
    let unit = dp.unit ?? named.unit;
    if (unit === undefined && temperature && !runtimeUnit) {
      unit = temperatureUnit ?? "C";
    }
    if (unit === undefined && HUMIDITY_CONTROLS.has(base)) {
      unit = "%";
    }
    const measures = COMPOSITE_MEASURES[base as ControlName];
    const defaultValue = DEFAULT_VALUE_DATA_POINTS.has(
      `${entity.entity}.${dp.name}`,
    )
      ? defaultValueOf(dp)
      : undefined;
    addControl(
      draft,
      base,
      kelvin(entity, { ...dp, ...(unit !== undefined && { unit }) }),
      entity,
      {
        ...(!(`${entity.entity}.${named.name}` in COMPOSITE_CONTROLS) && {
          attribute: true,
        }),
        ...(unitFrom && { unitFrom }),
        ...(measures && { measures }),
        ...(defaultValue !== undefined && { defaultValue }),
      },
    );
  }
}

// Source: A format packs fields of 1, 2 or 4 bytes one after another,
// big-endian, each signed when its range starts below 0 and otherwise
// running over every value its bytes hold, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L450-L474
// and https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/light.py#L210-L228.
// Each field becomes a control over the bytes it covers.
function addFormatControls(
  draft: Draft,
  entity: EntityConfig,
  dp: DataPointConfig,
  fields: readonly FormatField[],
): void {
  const length = fields.reduce((sum, field) => sum + (field.bytes ?? 1), 0);
  let offset = 0;
  for (const field of fields) {
    const bytes = field.bytes ?? 1;
    const mask =
      "00".repeat(offset) +
      "FF".repeat(bytes) +
      "00".repeat(length - offset - bytes);
    offset += bytes;
    // A field tuya-local does not interpret keeps its name as it is.
    const fieldName =
      COLOR_FIELDS[field.name] ?? camelCase(`color_${field.name}`, false);
    const min = field.range?.min ?? 0;
    const max = field.range?.max ?? 256 ** bytes - 1;
    addControl(
      draft,
      dp.name === "rgbhsv"
        ? fieldName
        : camelCase(dp.name) +
            fieldName.charAt(0).toUpperCase() +
            fieldName.slice(1),
      {
        id: dp.id,
        name: dp.name,
        type: dp.type,
        ...(dp.specType !== undefined && { specType: dp.specType }),
        ...(dp.readonly && { readonly: true }),
        range: { min, max },
        mask,
        ...(min < 0 && { mask_signed: true }),
      },
      entity,
      {
        kind: "number",
        ...(!(`${entity.entity}.${dp.name}` in COMPOSITE_CONTROLS) && {
          attribute: true,
        }),
      },
    );
  }
}

// Source: A light's colour temperature with a target_range reads in kelvin,
// which Home Assistant takes it in, in
// https://github.com/make-all/tuya-local/commit/1764d0c3764fe882788de59d86929e17b2f5f76f.
function kelvin(entity: EntityConfig, dp: DataPointConfig): DataPointConfig {
  const ranged = (dp.mapping ?? []).some(
    (rule) => !("dps_val" in rule) && rule.target_range,
  );
  return entity.entity === "light" && dp.name === "color_temp" && ranged
    ? { ...dp, unit: "K" }
    : dp;
}

function addSimpleControls(
  draft: Draft,
  entity: EntityConfig,
  entities: readonly EntityConfig[],
): void {
  const base = simpleBase(entity, entities);
  const primary = PRIMARY_DATA_POINTS[entity.entity];
  const kind = SIMPLE_KINDS[entity.entity];
  const measures = entityMeasures(entity);
  const unitDp = entity.dps.find((dp) => dp.name === "unit" && isControl(dp));
  const unitName = unitDp ? `${base}Unit` : undefined;
  for (const dp of entity.dps) {
    if (!isControl(dp) || isShadowed(entity, dp)) {
      continue;
    }
    if (entity.entity === "time" && TIME_UNITS[dp.name]) {
      addControl(draft, base, { ...dp, unit: TIME_UNITS[dp.name] }, entity, {
        ...(kind && { kind }),
      });
    } else if (
      dp.name === primary ||
      (entity.entity === "lock" && dp.name === "lock")
    ) {
      addControl(draft, base, dp, entity, {
        ...(unitName && { unitFrom: unitName }),
        ...(kind && { kind }),
        ...(measures && { measures }),
      });
    } else if (dp === unitDp && unitName) {
      addControl(draft, unitName, dp, entity, {});
    } else {
      const named = splitUnit(dp);
      addControl(
        draft,
        join(base, named.name),
        { ...dp, ...(named.unit !== undefined && { unit: named.unit }) },
        entity,
        { attribute: true },
      );
    }
  }
}

// Home Assistant's classes whose name says what they detect in its own terms,
// by the catalog's words for it: a problem is a fault, as the control that
// detects one is named, a plug is plugged in, safety is a hazard, and
// volatile organic compounds are one measure whatever their unit.
const CLASS_MEASURES: Record<string, Measure> = {
  plug: "plugged",
  problem: "fault",
  safety: "hazard",
  volatile_organic_compounds_parts: "volatileOrganicCompounds",
};

// What an entity measures or detects, by its class: the catalog's own words,
// so a class tuya-local adds stops the run until MEASURES names it.
function entityMeasures(entity: EntityConfig): Measure | undefined {
  if (
    !entity.class ||
    !MEASURING_ENTITIES.has(entity.entity) ||
    UNMEASURED_CLASSES.has(entity.class)
  ) {
    return undefined;
  }
  const measures =
    CLASS_MEASURES[entity.class] ?? camelCase(entity.class, false);
  if (!(MEASURES as readonly string[]).includes(measures)) {
    throw new Error(`Add "${measures}" to MEASURES in src/vocabulary.ts`);
  }
  return measures as Measure;
}

function simpleBase(
  entity: EntityConfig,
  entities: readonly EntityConfig[],
): string {
  if (entity.name) {
    return camelCase(flowName(entity, entities));
  }
  const key = translationKey(entity);
  if (key) {
    return SIMPLE_CONTROLS[`${entity.entity}/${key}`] ?? camelCase(key);
  }
  const unnamed = SIMPLE_CONTROLS[`${entity.entity}/`];
  if (unnamed) {
    return unnamed;
  }
  if (entity.class) {
    return (
      SIMPLE_CONTROLS[`${entity.entity}/class:${entity.class}`] ??
      camelCase(entity.class)
    );
  }
  return camelCase(entity.entity);
}

// Composite entities that ask for one component name, as two thermostats of
// one translation key, are told apart by their names, then their classes,
// then their kinds, where that tells them all apart; and else by an ordinal.
function nameComponents(
  entities: readonly EntityConfig[],
  mainName: string,
): Map<EntityConfig, string> {
  const names = new Map(
    entities.map((entity) => [entity, camelCase(componentKey(entity))]),
  );
  for (const name of new Set(names.values())) {
    const group = entities.filter((entity) => names.get(entity) === name);
    const taken = name === mainName ? [mainName] : [];
    if (group.length + taken.length < 2) {
      continue;
    }
    for (const field of ["name", "class", "entity"] as const) {
      const next = group.map((entity) => {
        const value = entity[field];
        return value === undefined ? name : camelCase(value);
      });
      if (
        next.some((other) => other !== name) &&
        new Set([...next, ...taken]).size === next.length + taken.length
      ) {
        group.forEach((entity, index) => {
          names.set(entity, next[index] ?? name);
        });
        break;
      }
    }
  }
  const taken: Record<string, true> = { [mainName]: true };
  for (const entity of entities) {
    const name = unique(taken, names.get(entity) ?? "");
    taken[name] = true;
    names.set(entity, name);
  }
  return names;
}

function componentKey(entity: EntityConfig): string {
  const key = translationKey(entity);
  if (key && !CAPABILITY_KEYS.has(key)) {
    return key;
  }
  return entity.name ?? entity.entity;
}

// Source: A translation key names one of several by its placeholders: a
// word of the key a placeholder names is its value, `valve_x` with `x: 1` the
// first valve, and the value of a placeholder the key does not name follows
// it, as tuya-local names the entity, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L322-L338.
function translationKey(entity: EntityConfig): string | undefined {
  const key = entity.translation_key ?? entity.translation_only_key;
  if (key === undefined) {
    return undefined;
  }
  let parts = key.split("_");
  for (const [name, value] of Object.entries(
    entity.translation_placeholders ?? {},
  )) {
    const slug = String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    parts = parts.includes(name)
      ? parts.map((part) => (part === name ? slug : part))
      : [...parts, slug];
  }
  return parts.join("_");
}

// A measurement named for "in" or "out", beside another of the device's
// measurements named for the other word, is one end of a flow: "TDS in" and
// "TDS out" are the inlet's and the outlet's. A control with no unit, such
// as a camera's "Zoom in" button, keeps its words, and so does any other
// "in", which a time's unit marker spells, as "pump cleaning in" minutes.
function flowName(
  entity: EntityConfig,
  entities: readonly EntityConfig[],
): string {
  const name = entity.name ?? "";
  const match = /^(.*\S)\s+(in|out)$/i.exec(name);
  if (!match) {
    return name;
  }
  const [, stem = "", end = ""] = match;
  const other = `${stem} ${end.toLowerCase() === "in" ? "out" : "in"}`;
  const measured = (candidate: EntityConfig) =>
    candidate.dps.some((dp) => dp.unit !== undefined);
  const paired = entities.some(
    (candidate) =>
      candidate.name?.toLowerCase() === other.toLowerCase() &&
      measured(candidate),
  );
  return paired && measured(entity) ? `${stem} ${end.toLowerCase()}let` : name;
}

function isControl(dp: DataPointConfig): boolean {
  return !dp.hidden && dp.name !== "available" && !/^unknown/.test(dp.name);
}

// Source: An entity keeps the last of its data points of one name, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/entity.py#L24-L33,
// though a redirect or a constraint finds the first.
function isShadowed(entity: EntityConfig, dp: DataPointConfig): boolean {
  return entity.dps.findLast((other) => other.name === dp.name) !== dp;
}

function addControl(
  draft: Draft,
  base: string,
  dp: DataPointConfig,
  entity: EntityConfig,
  options: {
    unitFrom?: string;
    kind?: ControlKind;
    measures?: Measure;
    defaultValue?: ControlValue;
    attribute?: true;
  },
): void {
  const { unitFrom } = options;
  const shortest =
    unitFrom || dp.unit === undefined ? base : controlName(base, dp.unit);
  const longest =
    unitFrom ||
    dp.unit === undefined ||
    COUNTED_UNITS.has(dp.unit) ||
    base.endsWith(`In${unitSuffix(dp.unit)}`)
      ? shortest
      : `${base}In${unitSuffix(dp.unit)}`;
  // A name that dropped its unit's word keeps it where another control
  // already has the shorter name.
  const name = shortest in draft && !(longest in draft) ? longest : shortest;
  const readOnly =
    dp.readonly ||
    READ_ONLY_ENTITIES.has(entity.entity) ||
    READ_ONLY_CONTROLS.has(base) ||
    READ_ONLY_DATA_POINTS.has(`${entity.entity}.${dp.name}`);
  const { target, booleanMask } = convertDataPoint(entity, dp, []);
  const {
    dataPoint,
    mask,
    maskSigned,
    littleEndian,
    readOnly: _,
    ...conversion
  } = target;
  // A masked data point's bits are read as an integer.
  const type =
    mask !== undefined && dp.type !== "bitfield" ? "integer" : dp.type;
  const kind: ControlKind =
    options.kind ??
    (readOnly
      ? "sensor"
      : booleanMask
        ? "switch"
        : (target.values?.length ?? 0) > 0
          ? "select"
          : type === "boolean"
            ? "switch"
            : NUMBER_TYPES.has(type)
              ? "number"
              : "text");
  const control: TuyaControl = {
    dataPoint,
    ...(mask !== undefined && { mask }),
    ...(maskSigned && { maskSigned }),
    ...(littleEndian && { littleEndian }),
    kind,
    ...(options.measures && { measures: options.measures }),
    ...(readOnly && { readOnly: true as const }),
    ...(dp.unit !== undefined && { unit: String(dp.unit) }),
    ...(unitFrom && { unitFrom }),
    ...conversion,
    ...(options.defaultValue !== undefined && {
      defaultValue: options.defaultValue,
    }),
  };
  draft[name] ??= [];
  draft[name].push({
    base,
    ...(!unitFrom && dp.unit !== undefined && { unit: String(dp.unit) }),
    control,
    entity,
    composite: isComposite(entity),
    attribute: options.attribute ?? false,
  });
}

// Source: The default is the first rule, or a rule's condition, marked
// `default` and not hidden: its value, else for a condition its rule's, else
// the rule's raw value, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L632-L660.
function defaultValueOf(dp: DataPointConfig): ControlValue | undefined {
  for (const rule of dp.mapping ?? []) {
    const ruleValue = "value" in rule ? rule.value : rule.dps_val;
    if (rule.default && !rule.hidden) {
      return (ruleValue ?? undefined) as ControlValue | undefined;
    }
    for (const condition of rule.conditions ?? []) {
      if (condition.default && !condition.hidden) {
        return (("value" in condition ? condition.value : ruleValue) ??
          undefined) as ControlValue | undefined;
      }
    }
  }
  return undefined;
}

// The conversion of a data point's raw values, as a control takes it, or a
// control that redirects to the data point. `trail` holds the data points a
// redirect came through, to find one that loops.
function convertDataPoint(
  entity: EntityConfig,
  dp: DataPointConfig,
  trail: readonly string[],
): { target: ControlTarget; booleanMask: boolean } {
  const values: ControlMapping[] = [];
  const own: Partial<ControlTarget> = {};
  let whenAbsent: ControlRule | undefined;
  let range = dp.range;
  const rules = dp.mapping ?? [];
  const lastDefault = rules.findLastIndex((rule) => !("dps_val" in rule));
  for (const [index, rule] of rules.entries()) {
    // Source: Of several rules with no dps_val, the last applies, in
    // https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L750-L759.
    if (
      neverMatches(dp, rule) ||
      (!("dps_val" in rule) && index !== lastDefault)
    ) {
      continue;
    }
    const converted = convertRule(entity, dp, rule, trail);
    // Source: A mapping with a dps_val but no value reads the raw value, and
    // takes it from the rule with no dps_val, in
    // https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L801-L807.
    if ("dps_val" in rule) {
      if (rule.dps_val === null) {
        // A write never takes the rule for an absent data point, so whether
        // it is hidden says nothing.
        const { readOnly: _, ...absent } = converted;
        whenAbsent ??= absent;
      } else {
        values.push({ raw: rawOf(dp, rule.dps_val), ...converted });
      }
      continue;
    }
    const { value, readOnly, dependsOn, redirect, mirror, availableWhile } =
      converted;
    if (value !== undefined) {
      own.otherwise = value;
    }
    // Source: A write never takes a hidden rule with no dps_val, in
    // https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L880-L885.
    if (readOnly) {
      own.ownRuleReadOnly = true;
    }
    if (availableWhile) {
      own.availableWhile = availableWhile;
    }
    if (dependsOn) {
      own.dependsOn = dependsOn;
    }
    if (redirect) {
      own.redirect = redirect;
    }
    if (mirror) {
      own.mirror = mirror;
    }
    if (rule.range) {
      range = rule.range;
    }
    if (typeof rule.scale === "number" && rule.scale !== 1) {
      own.scale = rule.scale;
    }
    if (typeof rule.step === "number") {
      own.step = rule.step;
    }
    if (rule.invert) {
      own.invert = true;
    }
    if (rule.target_range?.max !== undefined) {
      own.targetRange = {
        min: rule.target_range.min ?? 0,
        max: rule.target_range.max,
      };
    }
  }
  const masked = dp.mask !== undefined;
  const booleanMask =
    masked &&
    values.length === 0 &&
    own.otherwise === undefined &&
    (BOOLEAN_DATA_POINTS.has(dp.name) ||
      BOOLEAN_DATA_POINTS.has(`${entity.entity}.${dp.name}`));
  // A rule the conversion adds for raw values the file does not map leaves
  // an absent data point without a value, as tuya-local reads it.
  const ownAdded = own.otherwise === undefined;
  if (booleanMask) {
    values.push({ raw: 0, value: false }, { raw: 1, value: true });
    own.otherwise = true;
  } else if (entity.entity === "binary_sensor" && dp.name === "sensor") {
    readAsTruth(dp, values, own);
    if (whenAbsent?.value != null) {
      whenAbsent.value = truthy(whenAbsent.value);
    }
  }
  if (ownAdded && own.otherwise !== undefined && !whenAbsent) {
    whenAbsent =
      own.dependsOn || own.redirect || own.mirror ? undefined : { value: null };
  }
  return {
    target: {
      dataPoint: String(dp.id),
      ...(dp.specType !== undefined &&
        dp.type !== dp.specType && { type: dp.type as TuyaDataPointType }),
      ...(masked && { mask: String(dp.mask) }),
      // Source: tuya-local reads masked bits as signed on bytes alone, in
      // https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L493-L510.
      ...(dp.mask_signed &&
        PACKED_TYPES.has(dp.type) && { maskSigned: true as const }),
      ...(dp.endianness === "little" && { littleEndian: true as const }),
      ...(dp.readonly && { readOnly: true as const }),
      ...(range?.min !== undefined && { min: range.min }),
      ...(range?.max !== undefined && { max: range.max }),
      ...(values.length > 0 && { values }),
      ...(whenAbsent && { whenAbsent }),
      ...own,
    },
    booleanMask,
  };
}

// Source: A bitfield's rule matches a raw value it shares a bit with, and
// one whose dps_val is not a number matches none, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L558-L566.
function neverMatches(dp: DataPointConfig, rule: MappingRule): boolean {
  return (
    dp.type === "bitfield" &&
    typeof rule.dps_val === "string" &&
    Number.isNaN(Number(rule.dps_val))
  );
}

// A binary sensor is on while its value is truthy, as Python reads it (see
// BOOLEAN_DATA_POINTS), so each value it gives becomes true or false, and a
// raw value no rule names reads true, but the type's own falsy value.
function readAsTruth(
  dp: DataPointConfig,
  values: ControlMapping[],
  own: Partial<ControlTarget>,
): void {
  for (const mapping of values) {
    if (mapping.value !== null) {
      mapping.value = truthy(mapping.value ?? mapping.raw);
    }
  }
  if (own.otherwise != null) {
    own.otherwise = truthy(own.otherwise);
  }
  if (own.otherwise !== undefined) {
    return;
  }
  const named = values.map((mapping) => mapping.raw);
  if (
    dp.type === "boolean" &&
    (values.length === 0 || (named.includes(true) && named.includes(false)))
  ) {
    return;
  }
  const falsy =
    dp.mask !== undefined || NUMBER_TYPES.has(dp.type)
      ? 0
      : dp.type === "boolean"
        ? false
        : "";
  if (!named.includes(falsy)) {
    values.push({ raw: falsy, value: false });
  }
  own.otherwise = true;
}

function truthy(value: ControlValue): boolean {
  return value !== false && value !== 0 && value !== "";
}

// Source: tuya-local writes a raw value as its data point's type, a number
// on a string data point as Python's text for it, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L761-L778.
// That text matches a raw value as the number did, and keeps an integer too
// large for a JavaScript number whole.
function rawOf(dp: DataPointConfig, raw: unknown): ControlMapping["raw"] {
  if (
    STRING_TYPES.has(dp.type) &&
    dp.mask === undefined &&
    (typeof raw === "number" ||
      typeof raw === "bigint" ||
      typeof raw === "boolean")
  ) {
    return pyStr(raw);
  }
  if (typeof raw === "bigint") {
    throw new UnsupportedFeature(
      "an integer too large for a JavaScript number",
    );
  }
  return raw as ControlMapping["raw"];
}

// What a mapping rule gives, but its raw value and its conversion of numbers.
function convertRule(
  entity: EntityConfig,
  dp: DataPointConfig,
  rule: MappingRule,
  trail: readonly string[],
): ControlRule {
  const dependsOn = dependency(entity, dp, rule, trail);
  const redirect = redirectTarget(entity, dp, rule, rule.value_redirect, trail);
  const mirror = redirectTarget(entity, dp, rule, rule.value_mirror, trail);
  const availableWhile = availabilityTarget(entity, dp, rule, trail);
  // An `invalid` on a rule does nothing: tuya-local reads it from the
  // condition that holds alone, see DESIGN.md#catalog.
  return {
    ...("value" in rule && { value: rule.value as ControlRule["value"] }),
    ...(rule.hidden && { readOnly: true as const }),
    ...(dependsOn && { dependsOn }),
    ...(redirect && { redirect }),
    ...(mirror && { mirror }),
    ...(availableWhile && { availableWhile }),
  };
}

// Source: An `available` names a data point of the same entity whose value,
// as it converts, makes the rule apply while truthy, and one the entity
// lacks leaves the rule always available, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L578-L585.
function availabilityTarget(
  entity: EntityConfig,
  dp: DataPointConfig,
  rule: MappingRule,
  trail: readonly string[],
): ControlTarget | undefined {
  const name = rule.available;
  if (
    name === undefined ||
    !entity.dps.some((candidate) => candidate.name === name)
  ) {
    return undefined;
  }
  return redirectTarget(entity, dp, {}, name, trail);
}

// Source: A value_redirect or value_mirror names a data point of the same
// entity, whose value is read, as that data point converts it, in its place,
// in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L810-L818.
// The rule's own range, which tuya-local shows for the control, goes
// to the other data point when it has none: see DESIGN.md#catalog.
function redirectTarget(
  entity: EntityConfig,
  dp: DataPointConfig,
  rule: MappingRule,
  name: string | undefined,
  trail: readonly string[],
): ControlTarget | undefined {
  if (name === undefined) {
    return undefined;
  }
  const next = entity.dps.find((candidate) => candidate.name === name);
  if (!next) {
    throw new UnsupportedFeature("a `value_redirect` the entity lacks");
  }
  const path = [...trail, dp.name];
  if (path.includes(next.name)) {
    throw new LoopingRedirect("a `value_redirect` that loops");
  }
  const { target } = convertDataPoint(entity, next, path);
  return {
    ...target,
    ...(target.min === undefined &&
      rule.range?.min !== undefined && { min: rule.range.min }),
    ...(target.max === undefined &&
      rule.range?.max !== undefined && { max: rule.range.max }),
  };
}

// Source: A rule's conditions match the raw value of its constraint, the
// data point of that name in the same entity, or else of the rule's own,
// unless convertsConstraint says they match its value as it converts; a
// condition's dps_val can be one value or a list, and its nested mapping
// takes dps_val and value alone, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/devices/README.md#L488-L507.
function dependency(
  entity: EntityConfig,
  dp: DataPointConfig,
  rule: MappingRule,
  trail: readonly string[],
): ControlDependency | undefined {
  const conditions = rule.conditions ?? [];
  const constraint = entity.dps.find(
    (candidate) => candidate.name === (rule.constraint ?? dp.name),
  );
  if (conditions.length === 0 || !constraint) {
    return undefined;
  }
  const embedded =
    (constraint.mapping !== undefined || constraint.mask !== undefined) &&
    constraint.name !== dp.name &&
    !trail.includes(constraint.name)
      ? embedConstraint(entity, constraint, [...trail, dp.name])
      : undefined;
  return {
    dataPoint: String(constraint.id),
    ...(embedded && { constraint: embedded }),
    ...((constraint.readonly || convertsConstraint(constraint)) && {
      readOnly: true as const,
    }),
    conditions: conditions.map((rule) => condition(entity, dp, rule, trail)),
  };
}

// A constraint whose conversion leads back to the data point that names it
// is not embedded: writing through it would loop, as tuya-local's does, so
// a write sets its raw value alone.
function embedConstraint(
  entity: EntityConfig,
  constraint: DataPointConfig,
  trail: readonly string[],
): ControlTarget | undefined {
  try {
    return convertDataPoint(entity, constraint, trail).target;
  } catch (error) {
    if (error instanceof LoopingRedirect) {
      return undefined;
    }
    throw error;
  }
}

function condition(
  entity: EntityConfig,
  dp: DataPointConfig,
  rule: MappingRule,
  trail: readonly string[],
): ControlCondition {
  const redirect = redirectTarget(entity, dp, rule, rule.value_redirect, trail);
  const mirror = redirectTarget(entity, dp, rule, rule.value_mirror, trail);
  const availableWhile = availabilityTarget(entity, dp, rule, trail);
  // A condition with no dps_val never holds.
  const when =
    "dps_val" in rule
      ? Array.isArray(rule.dps_val)
        ? rule.dps_val
        : [rule.dps_val ?? null]
      : [];
  const absent = (rule.mapping ?? []).find(
    (nested) => nested.dps_val === null && "value" in nested,
  );
  const values = (rule.mapping ?? []).flatMap((nested) =>
    "value" in nested && nested.dps_val !== null
      ? [
          {
            raw: rawOf(dp, nested.dps_val),
            value: nested.value as ControlMapping["value"],
            ...(nested.hidden && { readOnly: true as const }),
          },
        ]
      : [],
  );
  return {
    when: when as ControlCondition["when"],
    ...("value" in rule && {
      value: rule.value as ControlCondition["value"],
    }),
    ...(rule.hidden && { readOnly: true as const }),
    ...(values.length > 0 && { values }),
    ...(typeof rule.scale === "number" && { scale: rule.scale }),
    ...(typeof rule.step === "number" && { step: rule.step }),
    ...(rule.invert && { invert: true as const }),
    ...(rule.target_range?.max !== undefined && {
      targetRange: {
        min: rule.target_range.min ?? 0,
        max: rule.target_range.max,
      },
    }),
    ...(rule.range?.min !== undefined && { min: rule.range.min }),
    ...(rule.range?.max !== undefined && { max: rule.range.max }),
    ...(redirect && { redirect }),
    ...(mirror && { mirror }),
    ...(availableWhile && { availableWhile }),
    ...(rule.invalid && { invalid: true as const }),
    ...(absent && {
      whenAbsent: { value: absent.value as ControlValue | null },
    }),
  };
}

// Joins a control's name to its data point's, once where the one ends in the
// word the other starts with: `fault` and `fault_code` make `faultCode`.
function join(base: string, name: string): string {
  const [last = ""] = words(base.replace(/([A-Z])/g, " $1")).slice(-1);
  const pascal = pascalCase(name);
  const [first = ""] = words(pascal.replace(/([A-Z])/g, " $1"));
  if (pascal.toLowerCase() === base.toLowerCase()) {
    return base;
  }
  if (first.toLowerCase() === last.toLowerCase()) {
    const head = base.slice(0, base.length - last.length);
    return head ? head + pascal : camelCase(name);
  }
  return base + pascal;
}

// A second control or component of one name that nothing else tells apart
// takes an ordinal before it, `secondCurrentInA`: a digit after it would
// read as part of the name or its unit, as in `cleanedAreaInM2` or `pm25`.
const ORDINALS = [
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

function unique(taken: Record<string, unknown>, name: string): string {
  if (!(name in taken)) {
    return name;
  }
  for (const ordinal of ORDINALS) {
    const candidate = ordinal + name.charAt(0).toUpperCase() + name.slice(1);
    if (!(candidate in taken)) {
      return candidate;
    }
  }
  throw new Error(
    `More than ${ORDINALS.length + 1} controls are named ${name}`,
  );
}

// A name carrying its unit after "In", as AGENTS.md#names asks. A name
// ending in the unit's word, as "time hours" in hours, carries it once; and a
// unit that is no unit of measure, which a name already ends in, such as "UV
// index", none. A unit of one letter is never taken from a name, where the
// letter can be a phase, as "current A".
function controlName(name: string, unit: string): string {
  if (COUNTED_UNITS.has(unit)) {
    return name;
  }
  const suffix = unitSuffix(unit);
  if (name.endsWith(`In${suffix}`)) {
    return name;
  }
  // A name ending in the word "in" before a time, as "pump cleaning in"
  // minutes, takes the unit's "In" alone.
  const base =
    /[a-z0-9]In$/.test(name) && TIME_SUFFIXES.has(suffix)
      ? name.slice(0, -2)
      : name;
  const ending =
    base.length > suffix.length &&
    base.endsWith(suffix) &&
    /[a-z0-9]/.test(base.charAt(base.length - suffix.length - 1));
  if (base.toLowerCase() === suffix.toLowerCase()) {
    return base;
  }
  if (ending && suffix.length > 1) {
    return UNIT_SUFFIXES[unit] === undefined
      ? base
      : `${base.slice(0, -suffix.length)}In${suffix}`;
  }
  return `${base}In${suffix}`;
}

// Source: tuya-local names some data points for their unit alone, as
// temp_set_f for a set point in Fahrenheit beside one in the climate's unit,
// in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/devices/amantii_trdlumina_fireplace.yaml#L18-L76.
// A data point that declares no unit takes it from its name's last word: F or
// C on a temperature, cm or mm. See DESIGN.md#catalog.
function splitUnit(dp: DataPointConfig): { name: string; unit?: string } {
  const parts = words(dp.name);
  const last = parts.at(-1)?.toLowerCase();
  const temperature = parts.some((part) => /^temp(erature)?$/i.test(part));
  const unit =
    dp.unit !== undefined || parts.length < 2
      ? undefined
      : (last === "f" || last === "c") && temperature
        ? last.toUpperCase()
        : last === "cm" || last === "mm"
          ? last
          : undefined;
  if (unit === undefined) {
    return { name: dp.name };
  }
  const rest = parts.slice(0, -1);
  if (rest.length > 1 && rest.at(-1)?.toLowerCase() === "in") {
    rest.pop();
  }
  return { name: rest.join("_"), unit };
}

// Words tuya-local abbreviates, in full, as AGENTS.md#names asks: phrases
// first, where a word means one thing in it and another alone.
const PHRASES: readonly [readonly string[], readonly string[]][] = [
  [
    ["temp", "pwd"],
    ["temporary", "password"],
  ],
  [
    ["temp", "password"],
    ["temporary", "password"],
  ],
  [
    ["tmp", "passwd"],
    ["temporary", "password"],
  ],
  [
    ["sw", "version"],
    ["software", "version"],
  ],
];
const ABBREVIATIONS: Record<string, string> = {
  batery: "battery",
  btn: "button",
  cfg: "config",
  cmd: "command",
  cnt: "count",
  cur: "current",
  curr: "current",
  dev: "device",
  ele: "electricity",
  ext: "external",
  msg: "message",
  num: "number",
  passwd: "password",
  pos: "position",
  pwd: "password",
  std: "standard",
  sw: "switch",
  sys: "system",
  temp: "temperature",
  val: "value",
};
// A lone letter after one of these words names a phase, as tuya-local's
// current_x, voltage_x and power_x take A, B, C or L1 to L3.
const ELECTRICAL_WORDS: ReadonlySet<string> = new Set([
  "consumed",
  "current",
  "energy",
  "factor",
  "power",
  "produced",
  "voltage",
]);
const PHASES: ReadonlySet<string> = new Set(["a", "b", "c", "l1", "l2", "l3"]);

function normalizeWords(parts: readonly string[]): string[] {
  const lower = parts.map((part) => part.toLowerCase());
  const phrased: string[] = [];
  for (let index = 0; index < lower.length; ) {
    const phrase = PHRASES.find(([from]) =>
      from.every((word, offset) => lower[index + offset] === word),
    );
    if (phrase) {
      phrased.push(...phrase[1]);
      index += phrase[0].length;
    } else {
      phrased.push(lower[index] ?? "");
      index++;
    }
  }
  const result: string[] = [];
  for (const [index, word] of phrased.entries()) {
    const channel = /^ch(\d+)$/.exec(word);
    const full = channel
      ? `channel${channel[1]}`
      : (ABBREVIATIONS[word] ?? word);
    if (
      PHASES.has(full) &&
      ELECTRICAL_WORDS.has(result.at(-1) ?? "") &&
      phrased[index + 1] !== "phase"
    ) {
      result.push("phase");
    }
    result.push(full);
  }
  return result;
}

function unitSuffix(unit: string): string {
  return (
    UNIT_SUFFIXES[unit] ??
    pascalCase(
      unit
        .replaceAll("/", " per ")
        .replaceAll("%", " percent ")
        .replaceAll("£", " pounds ")
        .replaceAll("°", " degrees ")
        .replaceAll("℃", " c ")
        .replace(/[µμ]/g, "u")
        .replaceAll("²", "2")
        .replaceAll("³", "3"),
      false,
    )
  );
}

function words(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// A name's words, abbreviations in full and phases named, unless `normalize`
// is false.
function nameWords(text: string, normalize: boolean): string[] {
  const parts = words(text);
  return normalize ? normalizeWords(parts) : parts;
}

function camelCase(text: string, normalize = true): string {
  const [first = "", ...rest] = nameWords(text, normalize);
  return first.toLowerCase() + rest.map(capitalize).join("");
}

function pascalCase(text: string, normalize = true): string {
  return nameWords(text, normalize).map(capitalize).join("");
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
