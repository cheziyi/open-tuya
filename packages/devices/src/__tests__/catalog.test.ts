import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog/index.js";
import { findDeviceEntries } from "../find.js";

describe("CATALOG", () => {
  it("names only data points each entry describes", () => {
    const strays = CATALOG.flatMap((entry) =>
      Object.entries(entry.components).flatMap(([component, controls]) =>
        Object.entries(controls)
          .filter(([, control]) => !entry.dataPoints[control.dataPoint])
          .map(([name]) => `${entry.source.file} ${component}.${name}`),
      ),
    );

    expect(strays).toEqual([]);
  });

  it("takes a unit only from a control in the same component", () => {
    const strays = CATALOG.flatMap((entry) =>
      Object.entries(entry.components).flatMap(([component, controls]) =>
        Object.entries(controls)
          .filter(
            ([, control]) =>
              control.unitFrom !== undefined && !controls[control.unitFrom],
          )
          .map(([name]) => `${entry.source.file} ${component}.${name}`),
      ),
    );

    expect(strays).toEqual([]);
  });

  it("names every component and control in camelCase", () => {
    const names = CATALOG.flatMap((entry) =>
      Object.entries(entry.components).flatMap(([component, controls]) => [
        component,
        ...Object.keys(controls),
      ]),
    );

    expect(names.filter((name) => !/^[a-z][a-zA-Z0-9]*$/.test(name))).toEqual(
      [],
    );
  });

  it("finds tuya-local's plug by its product key", () => {
    expect(
      findDeviceEntries({ productKey: "37mnhia3pojleqfh" }).map(
        (entry) => entry.source.file,
      ),
    ).toContain("smartplugv1.yaml");
  });
});
