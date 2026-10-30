import {
  type DataPoints,
  TuyaError,
  type TuyaErrorCode,
} from "@open-tuya/core";
import { CATALOG, type ControlValues } from "@open-tuya/devices";
import { createLocalTuyaClient } from "@open-tuya/local";
import { startSimulatedDevice } from "@open-tuya/simulators";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTuyaClient,
  RoutedTuyaClient,
  type TuyaRoute,
} from "../client.js";
import { FakeTuyaClient, FakeTuyaCloudAccount } from "./mocks/fakeClient.js";

const DEVICE_ID = "bf0123456789abcdefgh";
// Single switch with backlight, in the catalog.
const PRODUCT_KEY = "gbdzignerqxddcuj";
const DATA_POINTS = {
  "1": true,
  "7": 0,
  "14": "last",
  "15": "relay",
  "16": false,
};
// Four entries share this product key: a valve, a garage opener and two
// switches. Data point 3 is boolean in the garage opener and the triple
// switch, and in neither of the others.
const SHARED_PRODUCT_KEY = "key5ckdnys3pqgec";
const LOCAL_KEY = "0123456789abcdef";
// The TCP port reserved for tcpmux, which nothing listens on.
const CLOSED_PORT = 1;
// A runner on CI can take over a second to agree a session key.
const WAIT = { timeout: 5000 };

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function routed(...routes: FakeTuyaClient[]): RoutedTuyaClient {
  return new RoutedTuyaClient(routes, []);
}

function failure(code: TuyaErrorCode): TuyaError {
  return new TuyaError(code, `Failed with ${code}`);
}

describe("RoutedTuyaClient", () => {
  describe("requests", () => {
    it("sends a request through the first route", async () => {
      const first = new FakeTuyaClient({ "1": true });
      const second = new FakeTuyaClient({ "1": false });

      await expect(routed(first, second).readDataPoints()).resolves.toEqual({
        "1": true,
      });
      expect(second.requests).toEqual([]);
    });

    it("skips a route that is not connected", async () => {
      const first = new FakeTuyaClient({ "1": true });
      first.connected = false;
      const second = new FakeTuyaClient({ "1": false });

      await routed(first, second).writeDataPoints({ "1": true });

      expect(first.requests).toEqual([]);
      expect(second.writes).toEqual([{ "1": true }]);
    });

    it("tries the last route even when it is not connected", async () => {
      const first = new FakeTuyaClient();
      first.connected = false;
      const last = new FakeTuyaClient({ "1": true });
      last.connected = false;

      await expect(routed(first, last).readDataPoints()).resolves.toEqual({
        "1": true,
      });
    });

    it("moves a read on after any failure", async () => {
      const first = new FakeTuyaClient();
      first.failure = failure("REQUEST_TIMED_OUT");
      const second = new FakeTuyaClient({ "1": true });

      await expect(routed(first, second).readDataPoints()).resolves.toEqual({
        "1": true,
      });
    });

    it.each<TuyaErrorCode>([
      "CONNECTION_FAILED",
      "SESSION_KEY_NEGOTIATION_FAILED",
      "RATE_LIMITED",
      "SESSION_EXPIRED",
      "PERMISSION_DENIED",
      "UNMAPPED_DATA_POINT",
    ])(
      "moves a write on after %s, which shows the route did not deliver it",
      async (code) => {
        const first = new FakeTuyaClient();
        first.failure = failure(code);
        const second = new FakeTuyaClient();

        await routed(first, second).writeDataPoints({ "1": true });

        expect(second.writes).toEqual([{ "1": true }]);
      },
    );

    it.each<TuyaErrorCode>([
      "REQUEST_TIMED_OUT",
      "CONNECTION_LOST",
      "REQUEST_REJECTED",
    ])(
      "rejects a write with %s, which the device may have taken, without moving on",
      async (code) => {
        const first = new FakeTuyaClient();
        first.failure = failure(code);
        const second = new FakeTuyaClient();

        await expect(
          routed(first, second).writeDataPoints({ "1": true }),
        ).rejects.toBe(first.failure);
        expect(second.requests).toEqual([]);
      },
    );

    it("rejects a write with an error that is not a TuyaError, without moving on", async () => {
      const first = new FakeTuyaClient();
      first.failure = new RangeError("The local key is 15 bytes, not 16");
      const second = new FakeTuyaClient();

      await expect(
        routed(first, second).writeDataPoints({ "1": true }),
      ).rejects.toBe(first.failure);
    });

    it("starts each request at the first route again", async () => {
      const first = new FakeTuyaClient({ "1": true });
      first.connected = false;
      const second = new FakeTuyaClient({ "1": false });
      const client = routed(first, second);
      await client.readDataPoints();

      first.connected = true;

      await expect(client.readDataPoints()).resolves.toEqual({ "1": true });
    });

    it("rejects with the error of the one route it tried", async () => {
      const first = new FakeTuyaClient();
      first.connected = false;
      const second = new FakeTuyaClient();
      second.failure = failure("SESSION_EXPIRED");

      await expect(routed(first, second).readDataPoints()).rejects.toBe(
        second.failure,
      );
    });

    it("rejects with ROUTES_FAILED, each route's error in its cause, when several failed", async () => {
      const first = new FakeTuyaClient();
      first.failure = failure("DECRYPTION_FAILED");
      const second = new FakeTuyaClient();
      second.failure = failure("SESSION_EXPIRED");

      const error = await routed(first, second)
        .readDataPoints()
        .catch((error: unknown) => error);

      expect(error).toMatchObject({
        code: "ROUTES_FAILED",
        cause: { errors: [first.failure, second.failure] },
      });
      expect((error as Error).cause).toBeInstanceOf(AggregateError);
    });
  });

  describe("pushes", () => {
    it("hands on the pushes of the first route that is connected alone", async () => {
      const first = new FakeTuyaClient();
      const second = new FakeTuyaClient();
      const client = routed(first, second);
      const reports: DataPoints[] = [];
      client.onDataPoints((dataPoints) => reports.push(dataPoints));

      first.push({ "1": true });
      second.push({ "1": true });
      first.connected = false;
      second.push({ "1": false });

      expect(reports).toEqual([{ "1": true }, { "1": false }]);
    });

    it("stops handing on pushes to a listener once it is removed", () => {
      const first = new FakeTuyaClient();
      const client = routed(first);
      const reports: DataPoints[] = [];
      const remove = client.onDataPoints((dataPoints) =>
        reports.push(dataPoints),
      );

      remove();
      first.push({ "1": true });

      expect(reports).toEqual([]);
    });
  });

  describe("connected", () => {
    it("is connected while any route is", () => {
      const first = new FakeTuyaClient();
      const second = new FakeTuyaClient();
      const client = routed(first, second);

      first.connected = false;
      expect(client.connected).toBe(true);
      second.connected = false;
      expect(client.connected).toBe(false);
    });
  });

  describe("close", () => {
    it("closes every route once, and leaves the accounts open", async () => {
      const account = new FakeTuyaCloudAccount();
      const client = await createTuyaClient({
        deviceId: DEVICE_ID,
        routes: [{ cloud: account }],
      });

      await Promise.all([client.close(), client.close()]);

      expect(account.clients.map((route) => route.closes)).toEqual([1]);
      expect(account.closed).toBe(false);
    });

    it("closes at the end of an await using scope", async () => {
      const route = new FakeTuyaClient();
      {
        await using client = routed(route);
        await client.readDataPoints();
      }

      expect(route.closes).toBe(1);
    });
  });
});

describe("createTuyaClient", () => {
  describe("a device the catalog does not list", () => {
    // Data point 1 is a string and 4 an integer, as on a leak sensor's entry.
    const MOTION_SENSOR = {
      "1": { code: "pir", type: "enum", range: ["pir", "none"] },
      "4": { code: "battery_percentage", type: "integer", scale: 0 },
    } as const;

    function motionAccount(): FakeTuyaCloudAccount {
      const account = new FakeTuyaCloudAccount({ "1": "pir", "4": 80 });
      account.model = MOTION_SENSOR;
      return account;
    }

    it("names the controls from a cloud's model when given the category", async () => {
      await using client = await createTuyaClient({
        deviceId: DEVICE_ID,
        category: "pir",
        routes: [{ cloud: motionAccount() }],
      });

      await expect(client.readControls()).resolves.toEqual({
        device: { motion: true, batteryInPercent: 80 },
      });
      expect(client.entries.length).toBeGreaterThan(1);
    });

    it("finds the entry from the data points alone without the category", async () => {
      await using client = await createTuyaClient({
        deviceId: DEVICE_ID,
        routes: [{ cloud: motionAccount() }],
      });

      expect(client.entry?.products).not.toEqual([]);
    });

    it("finds the entry from the data points alone in a category the model does not describe whole", async () => {
      await using client = await createTuyaClient({
        deviceId: DEVICE_ID,
        category: "rs",
        routes: [{ cloud: motionAccount() }],
      });

      expect(client.entry?.products).not.toEqual([]);
    });

    it("finds the entry from the data points alone when the cloud gives no model", async () => {
      const account = motionAccount();
      account.modelFailure = failure("RATE_LIMITED");
      await using client = await createTuyaClient({
        deviceId: DEVICE_ID,
        category: "pir",
        routes: [{ cloud: account }],
      });

      expect(client.entry?.products).not.toEqual([]);
    });

    it("prefers the catalog's entry for a product it lists", async () => {
      const account = new FakeTuyaCloudAccount(DATA_POINTS);
      account.model = MOTION_SENSOR;
      await using client = await createTuyaClient({
        deviceId: DEVICE_ID,
        productKey: PRODUCT_KEY,
        category: "pir",
        routes: [{ cloud: account }],
      });

      expect(
        client.entry?.products.map(({ productKey }) => productKey),
      ).toContain(PRODUCT_KEY);
    });
  });

  it("rejects with a TypeError when given no route", async () => {
    await expect(
      createTuyaClient({ deviceId: DEVICE_ID, routes: [] }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it.each<[string, () => TuyaRoute]>([
    [
      "a LAN route read by writing null on 3.4",
      () => ({
        lan: {
          host: "127.0.0.1",
          version: "3.4",
          localKey: LOCAL_KEY,
          readByWritingNull: ["1"],
        },
      }),
    ],
    [
      "a route through a 3.1 gateway",
      () => {
        const gateway = createLocalTuyaClient({
          host: "127.0.0.1",
          port: CLOSED_PORT,
          version: "3.1",
          localKey: LOCAL_KEY,
          deviceId: "bf00000000000gateway",
        });
        cleanups.push(() => gateway.close());
        return { gateway, nodeId: "lamp" };
      },
    ],
  ])(
    "closes the routes it built when it cannot build %s, and rejects with its TypeError",
    async (_name, route) => {
      const account = new FakeTuyaCloudAccount();

      await expect(
        createTuyaClient({
          deviceId: DEVICE_ID,
          routes: [{ cloud: account }, route()],
        }),
      ).rejects.toBeInstanceOf(TypeError);

      expect(account.clients.map((client) => client.closes)).toEqual([1]);
    },
  );

  it("finds the device's entry from its product key and data points", async () => {
    const client = await createTuyaClient({
      deviceId: DEVICE_ID,
      productKey: PRODUCT_KEY,
      routes: [{ cloud: new FakeTuyaCloudAccount(DATA_POINTS) }],
    });

    expect(client.entry?.name).toBe("Single switch with backlight");
    expect(client.entries[0]).toBe(client.entry);
  });

  it("lists the entries of a shared product key first, then those its data points match, and uses the first", async () => {
    const client = await createTuyaClient({
      deviceId: DEVICE_ID,
      productKey: SHARED_PRODUCT_KEY,
      routes: [{ cloud: new FakeTuyaCloudAccount({ "1": true }) }],
    });

    expect(
      client.entries.slice(0, 4).map((entry) => entry.source?.file),
    ).toEqual(
      expect.arrayContaining([
        "ard100_valve.yaml",
        "garen_tsifit_garageopener.yaml",
        "lerlink_highpower_switch.yaml",
        "simple_triple_switch.yaml",
      ]),
    );
    expect(client.entries.length).toBeGreaterThan(4);
    expect(client.entry).toBe(client.entries[0]);
  });

  it("leaves out an entry whose data point has another type", async () => {
    const client = await createTuyaClient({
      deviceId: DEVICE_ID,
      productKey: SHARED_PRODUCT_KEY,
      routes: [{ cloud: new FakeTuyaCloudAccount({ "1": true, "3": 120 }) }],
    });

    const files = client.entries.map((entry) => entry.source?.file);
    expect(files.slice(0, 2).sort()).toEqual([
      "ard100_valve.yaml",
      "lerlink_highpower_switch.yaml",
    ]);
    expect(files).not.toContain("garen_tsifit_garageopener.yaml");
    expect(files).not.toContain("simple_triple_switch.yaml");
  });

  it("finds the entry from the product key alone when no route answers", async () => {
    const account = new FakeTuyaCloudAccount();
    account.failure = failure("SESSION_EXPIRED");

    const client = await createTuyaClient({
      deviceId: DEVICE_ID,
      productKey: PRODUCT_KEY,
      routes: [{ cloud: account }],
    });

    expect(client.entry?.name).toBe("Single switch with backlight");
  });

  it("uses the entry it is given, without reading the device", async () => {
    const found = await createTuyaClient({
      deviceId: DEVICE_ID,
      productKey: PRODUCT_KEY,
      routes: [{ cloud: new FakeTuyaCloudAccount(DATA_POINTS) }],
    });
    const account = new FakeTuyaCloudAccount(DATA_POINTS);

    const client = await createTuyaClient({
      deviceId: DEVICE_ID,
      routes: [{ cloud: account }],
      ...(found.entry && { entry: found.entry }),
    });

    expect(client.entry).toBe(found.entry);
    expect(account.clients[0]?.requests ?? []).toEqual([]);
  });

  describe("controls over a mask", () => {
    // Its colour is data point 24: hue, saturation and brightness, 2 bytes
    // each.
    const light = CATALOG.find(
      (entry) => entry.source?.file === "arlec_10_pathlights.yaml",
    );

    async function create(): Promise<{
      client: RoutedTuyaClient;
      cloud: FakeTuyaClient | undefined;
    }> {
      const account = new FakeTuyaCloudAccount({ "24": "000003e803e8" });
      const client = await createTuyaClient({
        deviceId: DEVICE_ID,
        routes: [{ cloud: account }],
        ...(light && { entry: light }),
      });
      await vi.waitFor(() => expect(account.clients).toHaveLength(1));
      return { client, cloud: account.clients[0] };
    }

    it("reads the device first, and keeps the bits the control does not set", async () => {
      const { client, cloud } = await create();

      await client.writeControls({ light: { hue: 120 } });

      expect(cloud?.requests).toEqual(["read", "write"]);
      expect(cloud?.writes.at(-1)).toEqual({ "24": "007803e803e8" });
    });

    it("builds each write on the one before, when two are sent at once", async () => {
      const { client, cloud } = await create();

      await Promise.all([
        client.writeControls({ light: { hue: 120 } }),
        client.writeControls({ light: { saturation: 500 } }),
      ]);

      expect(cloud?.writes).toEqual([
        { "24": "007803e803e8" },
        { "24": "007801f403e8" },
      ]);
    });

    it("builds on what the device pushed, without reading it", async () => {
      const { client, cloud } = await create();

      cloud?.push({ "24": "00b403e803e8" });
      await client.writeControls({ light: { saturation: 0 } });

      expect(cloud?.requests).toEqual(["write"]);
      expect(cloud?.writes.at(-1)).toEqual({ "24": "00b4000003e8" });
    });
  });

  describe("controls that depend on another data point", () => {
    // Its mode, data point 1 while on, reads auto or heat by data point 4.
    const thermostat = CATALOG.find(
      (entry) => entry.source?.file === "moes_bht002_thermostat_c.yaml",
    );

    async function create(dataPoints: Record<string, boolean | string>) {
      const account = new FakeTuyaCloudAccount(dataPoints);
      const client = await createTuyaClient({
        deviceId: DEVICE_ID,
        routes: [{ cloud: account }],
        ...(thermostat && { entry: thermostat }),
      });
      await vi.waitFor(() => expect(account.clients).toHaveLength(1));
      return { client, cloud: account.clients[0] };
    }

    it("reports a control again when a data point it depends on changes", async () => {
      const { client, cloud } = await create({ "1": true, "4": "0" });
      await client.readDataPoints();
      const reports: ControlValues[] = [];
      client.onControls((values) => reports.push(values));

      cloud?.push({ "4": "1" });

      expect(reports).toEqual([{ climate: { hvacMode: "heat" } }]);
    });

    it("reads the device first, and sets the data point the value depends on", async () => {
      const { client, cloud } = await create({ "1": false, "4": "0" });

      await client.writeControls({ climate: { hvacMode: "heat" } });

      expect(cloud?.requests).toEqual(["read", "write"]);
      expect(cloud?.writes).toEqual([{ "1": true, "4": "1" }]);
    });
  });

  describe("controls that read another data point", () => {
    it("reports a control that reads another data point while its own is absent", async () => {
      const account = new FakeTuyaCloudAccount();
      const client = await createTuyaClient({
        deviceId: DEVICE_ID,
        routes: [{ cloud: account }],
        entry: {
          name: "Meter",
          products: [],
          dataPoints: {
            "4": { type: "integer", optional: true },
            "8": { type: "integer", optional: true },
          },
          components: {
            device: {
              powerInW: {
                dataPoint: "4",
                kind: "sensor",
                readOnly: true,
                whenAbsent: { redirect: { dataPoint: "8", scale: 10 } },
              },
            },
          },
          source: { file: "meter.yaml", commit: "0".repeat(40) },
        },
      });
      await vi.waitFor(() => expect(account.clients).toHaveLength(1));
      const reports: ControlValues[] = [];
      client.onControls((values) => reports.push(values));

      account.clients[0]?.push({ "8": 2300 });

      expect(reports).toEqual([{ device: { powerInW: 230 } }]);
    });
  });

  describe("controls", () => {
    async function create(): Promise<{
      client: RoutedTuyaClient;
      account: FakeTuyaCloudAccount;
    }> {
      const account = new FakeTuyaCloudAccount({ ...DATA_POINTS });
      const client = await createTuyaClient({
        deviceId: DEVICE_ID,
        productKey: PRODUCT_KEY,
        routes: [{ cloud: account }],
      });
      return { client, account };
    }

    it("reads the device's controls by name", async () => {
      const { client } = await create();

      await expect(client.readControls()).resolves.toEqual({
        device: {
          on: true,
          timerInSeconds: 0,
          initialState: "memory",
          lightMode: "state",
        },
        backlight: { on: false },
      });
    });

    it("writes the data points that set the controls", async () => {
      const { client, account } = await create();

      await client.writeControls({
        device: { lightMode: "locator" },
        backlight: { on: true },
      });

      expect(account.clients[0]?.writes).toEqual([{ "15": "pos", "16": true }]);
    });

    it("hands on the controls of the data points a push carries alone", async () => {
      const { client, account } = await create();
      const reports: ControlValues[] = [];
      client.onControls((values) => reports.push(values));

      account.clients[0]?.push({ "16": true });
      account.clients[0]?.push({ "99": 1 });

      expect(reports).toEqual([{ backlight: { on: true } }]);
    });

    it("rejects with NO_CATALOG_ENTRY for a device the catalog lacks", async () => {
      const client = await createTuyaClient({
        deviceId: DEVICE_ID,
        routes: [{ cloud: new FakeTuyaCloudAccount({ "999": "text" }) }],
      });

      expect(client.entry).toBeUndefined();
      await expect(client.readControls()).rejects.toMatchObject({
        code: "NO_CATALOG_ENTRY",
      });
      await expect(
        client.writeControls({ device: { on: true } }),
      ).rejects.toMatchObject({ code: "NO_CATALOG_ENTRY" });
      expect(() => client.onControls(() => {})).toThrow(
        expect.objectContaining({ code: "NO_CATALOG_ENTRY" }),
      );
      await expect(client.readDataPoints()).resolves.toEqual({ "999": "text" });
    });
  });
});

describe("createTuyaClient through a gateway", () => {
  it("reaches a device behind a gateway over the gateway's connection, and leaves the gateway open", async () => {
    const device = await startSimulatedDevice({
      version: "3.5",
      localKey: LOCAL_KEY,
      subDevices: { lamp: { ...DATA_POINTS } },
    });
    cleanups.push(() => device.close());
    const gateway = createLocalTuyaClient({
      host: "127.0.0.1",
      port: device.port,
      version: "3.5",
      localKey: LOCAL_KEY,
      deviceId: device.deviceId,
    });
    cleanups.push(() => gateway.close());
    const client = await createTuyaClient({
      deviceId: "bf00000000000000lamp",
      productKey: PRODUCT_KEY,
      routes: [{ gateway, nodeId: "lamp" }],
    });

    await client.writeControls({ backlight: { on: true } });
    await client.close();

    expect(device.subDevices.lamp?.["16"]).toBe(true);
    expect(gateway.connected).toBe(true);
  });
});

describe("createTuyaClient over the LAN and a cloud", () => {
  it("reaches the device over the LAN while it is connected, and through the cloud once it is not", async () => {
    const device = await startSimulatedDevice({
      version: "3.5",
      localKey: LOCAL_KEY,
      dataPoints: DATA_POINTS,
      deviceId: DEVICE_ID,
      productKey: PRODUCT_KEY,
    });
    cleanups.push(() => device.close());
    const account = new FakeTuyaCloudAccount({ ...DATA_POINTS });
    const client = await createTuyaClient({
      deviceId: DEVICE_ID,
      productKey: device.productKey,
      routes: [
        {
          lan: {
            host: "127.0.0.1",
            port: device.port,
            version: "3.5",
            localKey: LOCAL_KEY,
          },
        },
        { cloud: account },
      ],
    });
    cleanups.push(() => client.close());
    const reports: ControlValues[] = [];
    client.onControls((values) => reports.push(values));
    const cloud = account.clients[0];
    await vi.waitFor(() => expect(reports).toHaveLength(1), WAIT);

    await client.writeControls({ device: { on: false } });
    await vi.waitFor(() => expect(reports).toHaveLength(2), WAIT);
    device.report({ "16": true });
    await vi.waitFor(() => expect(reports).toHaveLength(3), WAIT);
    cloud?.push({ "16": true });

    expect(device.dataPoints["1"]).toBe(false);
    expect(reports.slice(1)).toEqual([
      { device: { on: false } },
      { backlight: { on: true } },
    ]);
    expect(cloud?.requests).toEqual([]);

    await device.close();
    await vi.waitFor(() => {
      cloud?.push({ "16": false });
      expect(reports.at(-1)).toEqual({ backlight: { on: false } });
    }, WAIT);
    await client.writeControls({ device: { on: true } });

    expect(cloud?.writes).toEqual([{ "1": true }]);
  });

  it("finds the entry through the cloud when the LAN listed first cannot connect", async () => {
    const account = new FakeTuyaCloudAccount({ ...DATA_POINTS });
    const client = await createTuyaClient({
      deviceId: DEVICE_ID,
      routes: [
        {
          lan: {
            host: "127.0.0.1",
            port: CLOSED_PORT,
            version: "3.3",
            localKey: LOCAL_KEY,
          },
        },
        { cloud: account },
      ],
    });
    cleanups.push(() => client.close());

    expect(client.entry?.name).toBe("Single switch with backlight");
    expect(account.clients[0]?.requests).toEqual(["read"]);
  }, 10_000);
});
