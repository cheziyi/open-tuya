import {
  type ModelType,
  readModelValues,
  type TuyaDeviceModel,
  type TuyaModelDataPoint,
} from "@open-tuya/core";
import type { ThingProperty } from "./records.js";

// Source: A property's typeSpec names its type, `bool`, `value`, `enum`,
// `string`, `raw` or `bitmap` among others, and gives a value's min, max,
// step, unit and scale and an enum's range, in
// https://github.com/tuya/tuya-openclaw-skills/commit/016cb18098bb5302e24a9a33c1bcb665445eda7c.
const MODEL_TYPES_BY_SPEC: Readonly<Record<string, ModelType>> = {
  bool: "boolean",
  value: "integer",
  enum: "enum",
  string: "string",
  bitmap: "bitmap",
  raw: "raw",
};

/** Describes each property of a thing model by its code and the type and
 * values its typeSpec gives. A property of any other type, such as `float`
 * or `struct`, is left out. */
export function readDeviceModel(
  properties: readonly ThingProperty[],
): TuyaDeviceModel {
  const model: Record<string, TuyaModelDataPoint> = {};
  for (const property of properties) {
    const spec: Record<string, unknown> =
      typeof property.typeSpec === "object" && property.typeSpec !== null
        ? (property.typeSpec as Record<string, unknown>)
        : {};
    const type = Object.hasOwn(MODEL_TYPES_BY_SPEC, String(spec.type))
      ? MODEL_TYPES_BY_SPEC[String(spec.type)]
      : undefined;
    if (type === undefined) {
      continue;
    }
    model[String(property.abilityId)] = {
      code: property.code,
      type,
      ...readModelValues(spec),
    };
  }
  return model;
}
