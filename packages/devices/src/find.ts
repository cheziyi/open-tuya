import type { DataPoints, DataPointValue } from "@open-tuya/core";
import { CATALOG } from "./catalog/index.js";
import type { TuyaDataPointType, TuyaDeviceEntry } from "./entry.js";

const PRODUCT_MATCH = 101;

export interface FindDeviceEntriesOptions {
  /** The product key a device broadcasts or a cloud lists. */
  productKey?: string;
  /** The data points the device reports. */
  dataPoints?: DataPoints;
}

// Source: An entry matches when no data point the device reports has another
// type, and either its product key matches or the device reports every data
// point the entry requires; a product key match scores 101, and otherwise the
// score is the share of reported data points the entry names, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L138-L236.
/** Finds the entries that fit a device, best first. One product key can
 * match more than one entry, and a device with no known product key is
 * matched by the data points it reports. */
export function findDeviceEntries(
  options: FindDeviceEntriesOptions,
  catalog: readonly TuyaDeviceEntry[] = CATALOG,
): TuyaDeviceEntry[] {
  const reported = options.dataPoints ?? {};
  const ids = Object.keys(reported);
  return catalog
    .map((entry) => ({
      entry,
      score: score(entry, options.productKey, reported, ids),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}

function score(
  entry: TuyaDeviceEntry,
  productKey: string | undefined,
  reported: DataPoints,
  ids: readonly string[],
): number {
  const productMatch =
    productKey !== undefined && entry.productKeys.includes(productKey);
  let named = 0;
  for (const id of ids) {
    const spec = entry.dataPoints[id];
    if (spec) {
      if (!typeMatches(spec.type, reported[id] as DataPointValue)) {
        return 0;
      }
      named++;
    }
  }
  if (productMatch) {
    return PRODUCT_MATCH;
  }
  const missing = Object.entries(entry.dataPoints).some(
    ([id, spec]) => !spec.optional && reported[id] === undefined,
  );
  if (missing || ids.length === 0) {
    return 0;
  }
  return Math.round((named * 100) / ids.length);
}

// Source: A boolean never passes as an integer, and a number may arrive as a
// numeric string, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L21-L41.
function typeMatches(type: TuyaDataPointType, value: DataPointValue): boolean {
  switch (type) {
    case "boolean":
      return typeof value === "boolean";
    case "integer":
    case "bitfield":
    case "unixtime":
      return (
        typeof value === "number" ||
        (typeof value === "string" &&
          value.trim() !== "" &&
          Number.isInteger(Number(value)))
      );
    default:
      return typeof value === "string";
  }
}
