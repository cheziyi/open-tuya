import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog/index.js";
import { writeControls } from "../controls.js";
import { findDeviceEntries } from "../find.js";
import { CONTROL_NAMES, UNIT_SUFFIXES } from "../vocabulary.js";

describe("CATALOG", () => {
  it("names only data points each entry describes", () => {
    const strays = CATALOG.flatMap((entry) =>
      Object.entries(entry.components).flatMap(([component, controls]) =>
        Object.entries(controls)
          .filter(([, control]) => !entry.dataPoints[control.dataPoint])
          .map(([name]) => `${entry.source?.file} ${component}.${name}`),
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
          .map(([name]) => `${entry.source?.file} ${component}.${name}`),
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

  it("names in CONTROL_NAMES every control 20 or more entries share", () => {
    const known = new Set<string>(CONTROL_NAMES);
    const unit = new RegExp(`In(${UNIT_SUFFIXES.join("|")})$`);
    const ordinal =
      /^(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)([A-Z])/;
    const uses = new Map<string, number>();
    for (const entry of CATALOG) {
      const names = new Set<string>();
      for (const controls of Object.values(entry.components)) {
        for (const name of Object.keys(controls)) {
          const base = name
            .replace(unit, "")
            .replace(ordinal, (_, first: string) => first.toLowerCase());
          names.add(known.has(base) ? base : base.replace(/\d+$/, ""));
        }
      }
      for (const name of names) {
        uses.set(name, (uses.get(name) ?? 0) + 1);
      }
    }
    const missing = [...uses]
      .filter(([name, count]) => count >= 20 && !known.has(name))
      .map(([name]) => name);

    expect(missing).toEqual([]);
  });

  it("gives each control a default value it can write", () => {
    const unwritable = CATALOG.flatMap((entry) =>
      Object.entries(entry.components).flatMap(([component, controls]) =>
        Object.entries(controls).flatMap(([name, control]) => {
          if (control.defaultValue === undefined) {
            return [];
          }
          try {
            writeControls(
              entry,
              { [component]: { [name]: control.defaultValue } },
              {},
            );
            return [];
          } catch {
            return [`${entry.source?.file} ${component}.${name}`];
          }
        }),
      ),
    );

    expect(unwritable).toEqual([]);
  });

  it("writes a water heater's default mode with the data point it depends on", () => {
    const [entry] = findDeviceEntries({ productKey: "sz9gfbdn5my6GCfR" });
    const mode = entry?.components.waterHeater?.mode?.defaultValue;

    expect(mode).toBe("electric");
    expect(
      entry && writeControls(entry, { waterHeater: { mode: "electric" } }, {}),
    ).toEqual({ "101": true, "105": "2" });
  });

  it("finds tuya-local's plug by its product key", () => {
    expect(
      findDeviceEntries({ productKey: "37mnhia3pojleqfh" }).map(
        (entry) => entry.source?.file,
      ),
    ).toContain("smartplugv1.yaml");
  });
});
