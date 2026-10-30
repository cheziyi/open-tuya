import {
  MODEL_TYPES,
  type ModelType,
  readModelValues,
  type TuyaDeviceModel,
  type TuyaModelDataPoint,
} from "@open-tuya/core";
import type { StatusRelation } from "./records.js";

// Source: A relation's valueType is Boolean, Integer, Enum, String, Raw or
// Bitmap, in any letter case, and its valueDesc is JSON holding an integer's
// min and an enum's range, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13.
// Source: The same JSON holds an integer's max, scale, step and unit, as Home
// Assistant reads it from a data point's status range, in
// https://github.com/home-assistant-libs/tuya-device-handlers/commit/7d9b35afd9c3e3d135ed8b112517edfba70467d5.
/** Describes each data point `statusCodesById` maps, by the code the cloud reports it
 * under and the type and values its relation gives. A data point whose type
 * is none of `MODEL_TYPES` is left out. */
export function readDeviceModel(
  relations: readonly StatusRelation[],
  statusCodesById: ReadonlyMap<string, string>,
): TuyaDeviceModel {
  const model: Record<string, TuyaModelDataPoint> = {};
  for (const relation of relations) {
    const id = String(relation.dpId);
    const code = statusCodesById.get(id);
    const type = readType(relation.valueType);
    if (code !== undefined && type !== undefined) {
      model[id] = { code, type, ...readValues(relation.valueDesc) };
    }
  }
  return model;
}

function readType(valueType: unknown): ModelType | undefined {
  if (typeof valueType !== "string") {
    return undefined;
  }
  const type = valueType.toLowerCase();
  return MODEL_TYPES.find((known) => known === type);
}

function readValues(
  valueDesc: unknown,
): Omit<TuyaModelDataPoint, "code" | "type"> {
  let spec: unknown;
  try {
    spec = typeof valueDesc === "string" ? JSON.parse(valueDesc) : undefined;
  } catch {
    return {};
  }
  if (typeof spec !== "object" || spec === null) {
    return {};
  }
  return readModelValues(spec as Record<string, unknown>);
}
