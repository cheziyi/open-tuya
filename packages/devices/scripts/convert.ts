import { parse, YAMLParseError } from "yaml";
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
const MASKED_TYPES: ReadonlySet<string> = new Set([
  "base64",
  "bitfield",
  "hex",
  "integer",
]);
// Source: A format field of 1, 2 or 4 bytes unpacks as a number, and one of
// 3 bytes as bytes, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L49-L71.
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
  "climate.min_temperature": "minTargetTemperature",
  "climate.min_temp": "minTargetTemperature",
  "climate.max_temp": "maxTargetTemperature",
  "climate.temp_set": "targetTemperature",
  "climate.temp_current": "currentTemperature",
  "climate.temp_cur": "currentTemperature",
  "climate.current_temp": "currentTemperature",
  "climate.cur_temp": "currentTemperature",
  "climate.max_temperature": "maxTargetTemperature",
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
  "water_heater.min_temperature": "minTargetTemperature",
  "water_heater.max_temperature": "maxTargetTemperature",
  "water_heater.temperature_unit": "temperatureUnit",
  "water_heater.away_mode": "awayMode",
  "fan.switch": "on",
  "fan.speed": "speed",
  "fan.preset_mode": "mode",
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
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/climate.py#L127-L156.
const TEMPERATURE_UNIT_DATA_POINTS = [
  "temperature",
  "target_temp_high",
  "target_temp_low",
  "current_temperature",
];

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
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/switch.py#L58-L63,
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/binary_sensor.py#L64-L66
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/light.py#L154-L157,
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
  maxTargetTemperature: "temperature",
  minTargetTemperature: "temperature",
  targetHumidity: "humidity",
  targetTemperature: "temperature",
};

// The unit a time entity's data point carries, by its name.
const TIME_UNITS: Record<string, string> = {
  hour: "h",
  minute: "min",
  second: "s",
};

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

/** Converts one tuya-local device file, or names the feature it uses that
 * the catalog does not convert. */
export function convertDeviceFile(text: string): Conversion {
  let file: DeviceFile;
  try {
    file = parse(text) as DeviceFile;
  } catch (error) {
    if (error instanceof YAMLParseError) {
      return { unsupported: "not valid YAML 1.2" };
    }
    throw error;
  }
  const reason = unsupportedFeature(file);
  if (reason) {
    return { unsupported: reason };
  }
  // Source: Each declaration of a data point reads it as its own type, in
  // https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L408-L428.
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
      if (rules.filter((rule) => !("dps_val" in rule)).length > 1) {
        reasons.add("more than one default mapping");
      }
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
  // own step and range only stand in for the other's, see redirectTarget.
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
  } else if (
    PACKED_TYPES.has(constraint.type) &&
    (constraint.mask !== undefined || constraint.mapping !== undefined)
  ) {
    reasons.push("a `constraint` read through a mask or a mapping");
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
    for (const nested of condition.mapping ?? []) {
      if (nested.dps_val === null) {
        reasons.push("a condition's mapping of the value while absent");
      }
    }
  }
  return reasons;
}

function unsupportedPacking(
  entity: EntityConfig,
  dp: DataPointConfig,
): string | undefined {
  if (dp.format) {
    if (entity.entity !== "light") {
      return "`format` outside a light";
    }
    if (!PACKED_TYPES.has(dp.type)) {
      return "`format` on a data point that is not hex or base64";
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
  const writable = !dp.readonly && !READ_ONLY_ENTITIES.has(entity.entity);
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

function components(
  file: DeviceFile,
): Record<string, Record<string, TuyaControl>> {
  const entities = file.entities.filter((entity) => !entity.deprecated);
  const isComposite = (entity: EntityConfig) =>
    COMPOSITE_ENTITIES.has(entity.entity) &&
    !(entity.entity === "lock" && entity.translation_key === "child_lock");
  const main = entities.find(
    (entity) => isComposite(entity) && !entity.name && !entity.translation_key,
  );
  const result: Record<string, Record<string, TuyaControl>> = {};
  const mainName = main ? camelCase(main.entity) : "device";
  const unitSelect = entities.some(
    (entity) =>
      entity.entity === "select" &&
      entity.translation_key === "temperature_unit",
  );
  for (const entity of entities) {
    let componentName = mainName;
    if (isComposite(entity) && entity !== main) {
      componentName = unique(result, camelCase(componentKey(entity)));
    }
    result[componentName] ??= {};
    const component = result[componentName];
    if (isComposite(entity)) {
      addCompositeControls(component, entity, unitSelect && entity === main);
    } else {
      addSimpleControls(component, entity);
    }
  }
  for (const [name, controls] of Object.entries(result)) {
    if (Object.keys(controls).length === 0) {
      delete result[name];
    }
  }
  return result;
}

function addCompositeControls(
  component: Record<string, TuyaControl>,
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
    if (!isControl(dp)) {
      continue;
    }
    if (dp.format) {
      addFormatControls(component, entity, dp, dp.format);
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
      component,
      base,
      kelvin(entity, { ...dp, ...(unit !== undefined && { unit }) }),
      entity,
      {
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
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L450-L474
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/light.py#L210-L228.
// Each field becomes a control over the bytes it covers.
function addFormatControls(
  component: Record<string, TuyaControl>,
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
      component,
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
      { kind: "number" },
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
  component: Record<string, TuyaControl>,
  entity: EntityConfig,
): void {
  const base = simpleBase(entity);
  const primary = PRIMARY_DATA_POINTS[entity.entity];
  const kind = SIMPLE_KINDS[entity.entity];
  const measures = entityMeasures(entity);
  const unitDp = entity.dps.find((dp) => dp.name === "unit" && isControl(dp));
  const unitName = unitDp ? `${base}Unit` : undefined;
  for (const dp of entity.dps) {
    if (!isControl(dp)) {
      continue;
    }
    if (entity.entity === "time" && TIME_UNITS[dp.name]) {
      addControl(
        component,
        base,
        { ...dp, unit: TIME_UNITS[dp.name] },
        entity,
        {
          ...(kind && { kind }),
        },
      );
    } else if (
      dp.name === primary ||
      (entity.entity === "lock" && dp.name === "lock")
    ) {
      addControl(component, base, dp, entity, {
        ...(unitName && { unitFrom: unitName }),
        ...(kind && { kind }),
        ...(measures && { measures }),
      });
    } else if (dp === unitDp && unitName) {
      addControl(component, unitName, dp, entity, {});
    } else {
      const named = splitUnit(dp);
      addControl(
        component,
        join(base, named.name),
        { ...dp, ...(named.unit !== undefined && { unit: named.unit }) },
        entity,
        {},
      );
    }
  }
}

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
  const measures = camelCase(entity.class, false);
  if (!(MEASURES as readonly string[]).includes(measures)) {
    throw new Error(`Add "${measures}" to MEASURES in src/vocabulary.ts`);
  }
  return measures as Measure;
}

function simpleBase(entity: EntityConfig): string {
  if (entity.name) {
    return camelCase(entity.name);
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

function componentKey(entity: EntityConfig): string {
  const key = translationKey(entity);
  if (key && !CAPABILITY_KEYS.has(key)) {
    return key;
  }
  return entity.name ?? entity.entity;
}

// A key ending in `_x` names one of several, with `x` among its placeholders:
// `valve_x` with `x: 1` is the first valve.
function translationKey(entity: EntityConfig): string | undefined {
  const key = entity.translation_key ?? entity.translation_only_key;
  const placeholder = entity.translation_placeholders?.x;
  if (key?.endsWith("_x") && placeholder !== undefined) {
    return `${key.slice(0, -1)}${placeholder}`;
  }
  return key;
}

function isControl(dp: DataPointConfig): boolean {
  return !dp.hidden && dp.name !== "available" && !/^unknown/.test(dp.name);
}

function addControl(
  component: Record<string, TuyaControl>,
  base: string,
  dp: DataPointConfig,
  entity: EntityConfig,
  options: {
    unitFrom?: string;
    kind?: ControlKind;
    measures?: Measure;
    defaultValue?: ControlValue;
  },
): void {
  const { unitFrom } = options;
  const shortest =
    unitFrom || dp.unit === undefined ? base : controlName(base, dp.unit);
  // A name that dropped its unit's word keeps it where another control
  // already has the shorter name.
  const name = unique(
    component,
    shortest in component && dp.unit !== undefined && !unitFrom
      ? `${base}In${unitSuffix(dp.unit)}`
      : shortest,
  );
  const readOnly =
    dp.readonly ||
    READ_ONLY_ENTITIES.has(entity.entity) ||
    READ_ONLY_CONTROLS.has(base);
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
  component[name] = {
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
  for (const rule of dp.mapping ?? []) {
    const converted = convertRule(entity, dp, rule, trail);
    if ("dps_val" in rule) {
      const { value, dependsOn, redirect, mirror } = converted;
      if (value === undefined && !dependsOn && !redirect && !mirror) {
        continue;
      }
      if (rule.dps_val === null) {
        // A write never takes the rule for an absent data point, so whether
        // it is hidden says nothing.
        const { readOnly: _, ...absent } = converted;
        whenAbsent = absent;
      } else {
        values.push({
          raw: rule.dps_val as ControlMapping["raw"],
          ...converted,
        });
      }
      continue;
    }
    const { value, dependsOn, redirect, mirror, availableWhile } = converted;
    if (value !== undefined) {
      own.otherwise = value;
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
  if (booleanMask) {
    values.push({ raw: 0, value: false }, { raw: 1, value: true });
    own.otherwise = true;
  }
  return {
    target: {
      dataPoint: String(dp.id),
      ...(dp.specType !== undefined &&
        dp.type !== dp.specType && { type: dp.type as TuyaDataPointType }),
      ...(masked && { mask: String(dp.mask) }),
      ...(dp.mask_signed && { maskSigned: true as const }),
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
    ...("value" in rule &&
      rule.value !== null && { value: rule.value as ControlRule["value"] }),
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
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L578-L585.
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
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L810-L818.
// The rule's own step and range, which tuya-local shows for the control, go
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
    throw new UnsupportedFeature("a `value_redirect` that loops");
  }
  const { target } = convertDataPoint(entity, next, path);
  return {
    ...target,
    ...(target.min === undefined &&
      rule.range?.min !== undefined && { min: rule.range.min }),
    ...(target.max === undefined &&
      rule.range?.max !== undefined && { max: rule.range.max }),
    ...(target.step === undefined &&
      typeof rule.step === "number" && { step: rule.step }),
  };
}

// Source: A rule's conditions match the raw value of its constraint, the
// data point of that name in the same entity, or else of the rule's own; a
// condition's dps_val can be one value or a list, and its nested mapping
// takes dps_val and value alone, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/devices/README.md#L490-L509.
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
  return {
    dataPoint: String(constraint.id),
    ...(constraint.readonly && { readOnly: true as const }),
    conditions: conditions.map((rule) => condition(entity, dp, rule, trail)),
  };
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
  const values = (rule.mapping ?? []).flatMap((nested) =>
    "value" in nested && nested.value !== null
      ? [
          {
            raw: nested.dps_val as ControlMapping["raw"],
            value: nested.value as ControlMapping["value"],
            ...(nested.hidden && { readOnly: true as const }),
          },
        ]
      : [],
  );
  return {
    when: when as ControlCondition["when"],
    ...("value" in rule &&
      rule.value !== null && {
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

function unique(taken: Record<string, unknown>, name: string): string {
  if (!(name in taken)) {
    return name;
  }
  let index = 2;
  while (`${name}${index}` in taken) {
    index++;
  }
  return `${name}${index}`;
}

// A name carrying its unit after "In", as AGENTS.md#names asks. A name
// ending in the unit's word, as "time hours" in hours, carries it once; and a
// unit that is no unit of measure, which a name already ends in, such as "UV
// index", none. A unit of one letter is never taken from a name, where the
// letter can be a phase, as "current A".
function controlName(base: string, unit: string): string {
  const suffix = unitSuffix(unit);
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
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/devices/amantii_trdlumina_fireplace.yaml#L18-L76.
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
