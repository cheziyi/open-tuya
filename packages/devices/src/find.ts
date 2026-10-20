import type { DataPoints, DataPointValue } from "@open-tuya/core";
import { CATALOG } from "./catalog/index.js";
import type { TuyaDataPointType, TuyaDeviceEntry } from "./entry.js";
import { parseInteger } from "./python.js";

const PRODUCT_MATCH = 101;

export interface FindDeviceEntriesOptions {
  /** The product key a device broadcasts or a cloud lists. */
  productKey?: string;
  /** Every product key the device is known by, such as the one a cloud lists
   * and the one the device broadcasts, which can differ: an entry listing
   * any of them, or `productKey`, matches. */
  productKeys?: readonly string[];
  /** The data points the device reports. */
  dataPoints?: DataPoints;
}

// Source: An entry matches when no data point the device reports fails a
// type it is read as, and either one of the device's product keys matches or
// the device reports every data point the entry requires; a product key
// match scores 101, and otherwise the score is the share of reported data
// points the entry names, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L138-L236.
// tuya-local passes the product ID the cloud lists and the product key the
// device broadcasts together, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/config_flow.py#L423-L430.
/** Finds the entries that fit a device, best first. One product key can
 * match more than one entry, and a device with no known product key is
 * matched by the data points it reports. */
export function findDeviceEntries(
  options: FindDeviceEntriesOptions,
  catalog: readonly TuyaDeviceEntry[] = CATALOG,
): TuyaDeviceEntry[] {
  const reported = options.dataPoints ?? {};
  const ids = Object.keys(reported);
  const productKeys = [
    ...(options.productKey === undefined ? [] : [options.productKey]),
    ...(options.productKeys ?? []),
  ];
  return catalog
    .map((entry) => ({
      entry,
      score: score(entry, productKeys, reported, ids),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}

function score(
  entry: TuyaDeviceEntry,
  productKeys: readonly string[],
  reported: DataPoints,
  ids: readonly string[],
): number {
  const productMatch = entry.products.some((product) =>
    productKeys.includes(product.productKey),
  );
  let named = 0;
  for (const id of ids) {
    const spec = entry.dataPoints[id];
    if (spec) {
      const value = reported[id] as DataPointValue;
      if (
        ![spec.type, ...(spec.otherTypes ?? [])].every((type) =>
          typeMatches(type, value),
        )
      ) {
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

// Source: An integer is a whole number, never a boolean, or a string
// Python's int() reads, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L22-L41.
function typeMatches(type: TuyaDataPointType, value: DataPointValue): boolean {
  switch (type) {
    case "boolean":
      return typeof value === "boolean";
    case "integer":
    case "bitfield":
    case "unixtime":
      return (
        (typeof value === "number" && Number.isInteger(value)) ||
        (typeof value === "string" && parseInteger(value) !== undefined)
      );
    default:
      return typeof value === "string";
  }
}
