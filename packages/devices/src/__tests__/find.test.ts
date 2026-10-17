import { describe, expect, it } from "vitest";
import type { TuyaDeviceEntry } from "../entry.js";
import { findDeviceEntries } from "../find.js";

function entry(
  name: string,
  productKeys: string[],
  dataPoints: TuyaDeviceEntry["dataPoints"],
): TuyaDeviceEntry {
  return {
    name,
    productKeys,
    dataPoints,
    components: {},
    source: { file: `${name}.yaml`, commit: "0".repeat(40) },
  };
}

const PLUG = entry("plug", ["37mnhia3pojleqfh"], {
  "1": { type: "boolean" },
  "9": { type: "integer", optional: true },
});
const METER = entry("meter", [], {
  "1": { type: "boolean" },
  "18": { type: "integer" },
  "19": { type: "integer" },
});
const LIGHT = entry("light", ["37mnhia3pojleqfh"], {
  "20": { type: "boolean" },
  "22": { type: "integer" },
});
const CATALOG = [PLUG, METER, LIGHT];

describe("findDeviceEntries", () => {
  it("finds every entry with the product key", () => {
    expect(
      findDeviceEntries({ productKey: "37mnhia3pojleqfh" }, CATALOG),
    ).toEqual([PLUG, LIGHT]);
  });

  it("drops an entry with the product key whose data point has another type", () => {
    expect(
      findDeviceEntries(
        { productKey: "37mnhia3pojleqfh", dataPoints: { "1": 1 } },
        CATALOG,
      ),
    ).toEqual([LIGHT]);
  });

  it("matches a device with no known product key by the data points it reports, best first", () => {
    expect(
      findDeviceEntries(
        { dataPoints: { "1": true, "18": 120, "19": "2300" } },
        CATALOG,
      ),
    ).toEqual([METER, PLUG]);
  });

  it("never matches an entry by data points while one it requires is missing", () => {
    expect(
      findDeviceEntries({ dataPoints: { "1": true, "18": 120 } }, CATALOG),
    ).toEqual([PLUG]);
  });

  it("matches nothing with neither a product key nor data points", () => {
    expect(findDeviceEntries({}, CATALOG)).toEqual([]);
  });
});
