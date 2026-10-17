import {
  type DataPoints,
  TuyaError,
  type TuyaErrorCode,
} from "@open-tuya/core";
import type { ControlValues } from "@open-tuya/devices";
import { startSimulatedDevice } from "@open-tuya/simulators";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTuyaClient, RoutedTuyaClient } from "../client.js";
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
        message: expect.stringMatching(
          /route 1: Failed with DECRYPTION_FAILED; route 2: Failed with SESSION_EXPIRED/,
        ),
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
  it("rejects with a TypeError when given no route", async () => {
    await expect(
      createTuyaClient({ deviceId: DEVICE_ID, routes: [] }),
    ).rejects.toBeInstanceOf(TypeError);
  });

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
      client.entries.slice(0, 4).map((entry) => entry.source.file),
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

    const files = client.entries.map((entry) => entry.source.file);
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
    expect(cloud?.requests).toEqual(["read"]);

    await device.close();
    await vi.waitFor(() => {
      cloud?.push({ "16": false });
      expect(reports.at(-1)).toEqual({ backlight: { on: false } });
    }, WAIT);
    await client.writeControls({ device: { on: true } });

    expect(cloud?.writes).toEqual([{ "1": true }]);
  });
});
