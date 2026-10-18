import type { DataPoints } from "@open-tuya/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppCloudAccount } from "../account.js";
import { openMqttConnection } from "../mqtt.js";
import {
  COMMAND_NOT_SUPPORTED,
  PUSH_CONFIG,
  RATE_LIMITED,
} from "../protocol/__tests__/fixtures/capturedResponses.js";
import type { AppCloudSession } from "../session.js";
import { until, useFakeTimers } from "./clock.js";
import { type Broker, startBroker } from "./mocks/broker.js";
import { FakeCloud } from "./mocks/fakeCloud.js";

// Source: Home Assistant's client ID, in
// https://github.com/home-assistant/core/blob/82e1ed43f85b3254c51e7a8200ece159019743ab/homeassistant/components/tuya/const.py#L39-L40.
const CLIENT_ID = "HA_3y9q4ak7g4ephrvke";
const DEVICE_ID = "bf6c8539693b0cdea25thg";
const HOME_ID = "297928323";

// Source: The shape of a device, a relation and a status, as captured in
// https://github.com/home-assistant/core/issues/162625, with its key and IDs
// made up.
const DEVICE_RECORD = {
  active_time: 1778448055,
  category: "cz",
  id: DEVICE_ID,
  ip: "203.0.113.7",
  local_key: "0123456789abcdef",
  name: "Plug",
  online: true,
  product_id: "na90jncjlvw5t0ba",
  product_name: "Smart Plug",
  status: [
    { code: "switch_1", value: true },
    { code: "mode", value: "eco" },
  ],
  sub: false,
  uuid: "fd4c8e5123fa1cfe",
};
const SWITCH_RELATION = {
  dpCode: "switch_1",
  dpId: 1,
  enumMappingMap: {},
  statusCode: "switch_1",
  statusFormat: '{"switch_1":"$"}',
  supportLocal: true,
  valueConvert: "default",
  valueDesc: "{}",
  valueType: "Boolean",
};
const MODE_RELATION = {
  ...SWITCH_RELATION,
  dpCode: "work_mode",
  dpId: 2,
  statusCode: "mode",
  valueConvert: "enum",
  valueType: "Enum",
};

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

interface Setup {
  cloud: FakeCloud;
  account: AppCloudAccount;
  sessions: AppCloudSession[];
}

function setUp(expiresAtInMs = Date.now() + 7_200_000): Setup {
  const cloud = new FakeCloud(CLIENT_ID);
  const sessions: AppCloudSession[] = [];
  const account = new AppCloudAccount(cloud.fetch, openMqttConnection, {
    clientId: CLIENT_ID,
    session: {
      endpoint: cloud.endpoint,
      accessToken: cloud.accessToken,
      refreshToken: cloud.refreshToken,
      expiresAtInMs,
    },
    onSessionChange: (session) => sessions.push(session),
  });
  cleanups.push(() => account.close());
  cloud.on("GET", `/v1.0/m/life/devices/${DEVICE_ID}/status`, () => ({
    result: {
      category: "cz",
      dpStatusRelationDTOS: [SWITCH_RELATION, MODE_RELATION],
      productKey: DEVICE_RECORD.product_id,
    },
  }));
  cloud.on("GET", `/v1.0/m/life/ha/${DEVICE_ID}/code/custom-type`, () => ({
    result: false,
  }));
  cloud.on("GET", "/v1.0/m/life/ha/devices/detail", () => ({
    result: [DEVICE_RECORD],
  }));
  cloud.on("POST", `/v1.1/m/thing/${DEVICE_ID}/commands`, () => ({
    result: true,
  }));
  return { cloud, account, sessions };
}

async function serveBroker(
  cloud: FakeCloud,
  expireTime = 7200,
): Promise<Broker> {
  const broker = await startBroker();
  cleanups.push(() => broker.close());
  let issued = 0;
  cloud.on("POST", "/v1.0/m/life/ha/access/config", () => ({
    result: {
      ...PUSH_CONFIG,
      clientId: `cloud_${++issued}`,
      expireTime,
      url: broker.url,
    },
  }));
  return broker;
}

const PUSH_TOPIC = `cloud/device/${DEVICE_ID}/in/24d2afb98121974b6505c40a3a980362/pen`;

describe("AppCloudAccount", () => {
  describe("listDevices", () => {
    it("lists every home's devices with what a LAN client needs", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", "/v1.0/m/life/users/homes", () => ({
        result: [{ name: "Home", ownerId: HOME_ID }],
      }));
      cloud.on("GET", "/v1.0/m/life/ha/home/devices", () => ({
        result: [
          DEVICE_RECORD,
          {
            category: "wg2",
            id: "bf0000000000000gateway",
            name: "Gateway",
            node_id: "0028",
            online: true,
            product_id: "gatewayproduct00",
            sub: true,
          },
        ],
      }));

      await expect(account.listDevices()).resolves.toEqual([
        {
          deviceId: DEVICE_ID,
          name: "Plug",
          productKey: "na90jncjlvw5t0ba",
          localKey: "0123456789abcdef",
          category: "cz",
          online: true,
          homeId: HOME_ID,
        },
        {
          deviceId: "bf0000000000000gateway",
          name: "Gateway",
          productKey: "gatewayproduct00",
          category: "wg2",
          online: true,
          homeId: HOME_ID,
          nodeId: "0028",
        },
      ]);
      expect(cloud.requests.map(({ path, query }) => [path, query])).toEqual([
        ["/v1.0/m/life/users/homes", undefined],
        ["/v1.0/m/life/ha/home/devices", { homeId: HOME_ID }],
      ]);
      expect(cloud.badSignatures).toEqual([]);
    });
  });

  describe("AppCloudTuyaClient", () => {
    it("reads the data points the cloud passes through unchanged, by ID", async () => {
      const { cloud, account } = setUp();
      const client = await account.createClient(DEVICE_ID);

      await expect(client.readDataPoints()).resolves.toEqual({ "1": true });
      expect(cloud.requests.at(-1)?.query).toEqual({ devIds: DEVICE_ID });
    });

    it("writes a data point as a command by its code", async () => {
      const { cloud, account } = setUp();
      const client = await account.createClient(DEVICE_ID);

      await client.writeDataPoints({ "1": false });

      expect(cloud.requests.at(-1)?.body).toEqual({
        commands: [{ code: "switch_1", value: false }],
      });
      expect(cloud.badSignatures).toEqual([]);
    });

    it("rejects a write to a data point the cloud converts with UNMAPPED_DATA_POINT, sending nothing", async () => {
      const { cloud, account } = setUp();
      const client = await account.createClient(DEVICE_ID);
      const sent = cloud.requests.length;

      await expect(
        client.writeDataPoints({ "1": false, "2": "eco" }),
      ).rejects.toMatchObject({ code: "UNMAPPED_DATA_POINT" });
      expect(cloud.requests.length).toBe(sent);
    });

    // Source: Relations whose dpCode, statusCode and statusFormat's key differ,
    // as captured in https://github.com/home-assistant/core/issues/162625,
    // with clear_energy's conversion made "default".
    it("reads by statusFormat's key and writes by statusCode", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", `/v1.0/m/life/devices/${DEVICE_ID}/status`, () => ({
        result: {
          dpStatusRelationDTOS: [
            {
              ...SWITCH_RELATION,
              dpCode: "Power",
              statusCode: "switch",
              statusFormat: '{"switch":"$"}',
            },
            {
              ...SWITCH_RELATION,
              dpCode: "clear_energy",
              dpId: 12,
              statusCode: "clear_energy",
              statusFormat: '{"energy_reset":"$"}',
            },
          ],
        },
      }));
      cloud.on("GET", "/v1.0/m/life/ha/devices/detail", () => ({
        result: [
          {
            ...DEVICE_RECORD,
            status: [
              { code: "switch", value: true },
              { code: "energy_reset", value: false },
              { code: "clear_energy", value: true },
            ],
          },
        ],
      }));
      const client = await account.createClient(DEVICE_ID);

      await expect(client.readDataPoints()).resolves.toEqual({
        "1": true,
        "12": false,
      });
      await client.writeDataPoints({ "1": false, "12": true });
      expect(cloud.requests.at(-1)?.body).toEqual({
        commands: [
          { code: "switch", value: false },
          { code: "clear_energy", value: true },
        ],
      });
    });

    it("leaves out of a read, but writes, a data point whose statusFormat names no one code", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", `/v1.0/m/life/devices/${DEVICE_ID}/status`, () => ({
        result: {
          dpStatusRelationDTOS: [
            { ...SWITCH_RELATION, statusFormat: "not json" },
          ],
        },
      }));
      const client = await account.createClient(DEVICE_ID);

      await expect(client.readDataPoints()).resolves.toEqual({});
      await client.writeDataPoints({ "1": false });
      expect(cloud.requests.at(-1)?.body).toEqual({
        commands: [{ code: "switch_1", value: false }],
      });
    });

    it("maps nothing on a device of a custom type", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", `/v1.0/m/life/ha/${DEVICE_ID}/code/custom-type`, () => ({
        result: "true",
      }));
      const client = await account.createClient(DEVICE_ID);

      await expect(client.readDataPoints()).resolves.toEqual({});
    });

    it("maps nothing on a device with a relation that does not support local", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", `/v1.0/m/life/devices/${DEVICE_ID}/status`, () => ({
        result: {
          dpStatusRelationDTOS: [
            SWITCH_RELATION,
            { ...MODE_RELATION, supportLocal: false },
          ],
        },
      }));
      const client = await account.createClient(DEVICE_ID);

      await expect(client.readDataPoints()).resolves.toEqual({});
      await expect(client.writeDataPoints({ "1": true })).rejects.toMatchObject(
        { code: "UNMAPPED_DATA_POINT" },
      );
    });

    it("rejects with REQUEST_REJECTED when the cloud does not list the device", async () => {
      const { cloud, account } = setUp();
      const client = await account.createClient(DEVICE_ID);
      cloud.on("GET", "/v1.0/m/life/ha/devices/detail", () => ({ result: [] }));

      await expect(client.readDataPoints()).rejects.toMatchObject({
        code: "REQUEST_REJECTED",
      });
    });

    it("is connected until closed, then rejects with CONNECTION_LOST", async () => {
      const { account } = setUp();
      const client = await account.createClient(DEVICE_ID);
      expect(client.connected).toBe(true);

      await client.close();
      await client.close();

      expect(client.connected).toBe(false);
      await expect(client.readDataPoints()).rejects.toMatchObject({
        code: "CONNECTION_LOST",
      });
    });
  });

  describe("pushes", () => {
    it("hands each listener the data points the cloud pushes, by ID with the device's values", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);
      const client = await account.createClient(DEVICE_ID);
      const reports: DataPoints[] = [];
      client.onDataPoints((dataPoints) => reports.push(dataPoints));
      await until(() => broker.subscriptions.length > 0);

      await broker.publish(
        PUSH_TOPIC,
        JSON.stringify({
          protocol: 4,
          data: {
            devId: DEVICE_ID,
            status: [
              { dpId: 2, t: 1777624144986, value: "work" },
              { dpId: 103, t: 1777624144986, value: 6 },
            ],
          },
          t: 1777624145399,
        }),
      );
      await until(() => reports.length > 0);

      expect(broker.subscriptions).toEqual([PUSH_TOPIC]);
      expect(broker.connects).toEqual([
        {
          clientId: "cloud_1",
          username: PUSH_CONFIG.username,
          password: PUSH_CONFIG.password,
        },
      ]);
      expect(reports).toEqual([{ "2": "work", "103": 6 }]);
    });

    it("ignores another protocol, another device and a payload it cannot read", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);
      const client = await account.createClient(DEVICE_ID);
      const reports: DataPoints[] = [];
      client.onDataPoints((dataPoints) => reports.push(dataPoints));
      await until(() => broker.subscriptions.length > 0);

      await broker.publish(PUSH_TOPIC, "not json");
      await broker.publish(PUSH_TOPIC, "null");
      await broker.publish(
        PUSH_TOPIC,
        JSON.stringify({ protocol: 4, data: { devId: DEVICE_ID, status: 5 } }),
      );
      await broker.publish(
        PUSH_TOPIC,
        JSON.stringify({
          protocol: 4,
          data: { devId: DEVICE_ID, status: [null] },
        }),
      );
      await broker.publish(
        PUSH_TOPIC,
        JSON.stringify({
          protocol: 20,
          data: { bizCode: "online", bizData: { devId: DEVICE_ID } },
        }),
      );
      await broker.publish(
        PUSH_TOPIC,
        JSON.stringify({
          protocol: 4,
          data: { devId: "bfother", status: [{ dpId: 1, value: true }] },
        }),
      );
      await broker.publish(
        PUSH_TOPIC,
        JSON.stringify({
          protocol: 4,
          data: { devId: DEVICE_ID, status: [{ dpId: 1, value: false }] },
        }),
      );
      await until(() => reports.length > 0);

      expect(reports).toEqual([{ "1": false }]);
    });

    it("does not subscribe a device the cloud does not push by ID", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);
      cloud.on("GET", `/v1.0/m/life/ha/${DEVICE_ID}/code/custom-type`, () => ({
        result: true,
      }));

      await account.createClient(DEVICE_ID);

      expect(broker.connects).toEqual([]);
      expect(
        cloud.requests.some(
          ({ path }) => path === "/v1.0/m/life/ha/access/config",
        ),
      ).toBe(false);
    });

    it("shares one connection between clients, and closes it with the last", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);
      let disconnects = 0;
      broker.aedes.on("clientDisconnect", () => disconnects++);
      const first = await account.createClient(DEVICE_ID);
      const second = await account.createClient(DEVICE_ID);
      await until(() => broker.subscriptions.length > 0);

      await first.close();
      expect(disconnects).toBe(0);
      await second.close();
      await until(() => disconnects > 0);

      expect(broker.connects).toHaveLength(1);
      expect(broker.subscriptions).toEqual([PUSH_TOPIC]);
    });

    it("releases the connection when the account closes", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);
      let disconnects = 0;
      broker.aedes.on("clientDisconnect", () => disconnects++);
      await account.createClient(DEVICE_ID);
      await until(() => broker.subscriptions.length > 0);

      await account.close();
      await account.close();

      await until(() => disconnects > 0);
    });
  });

  describe("sessions", () => {
    it("refreshes a session a minute from expiring, and hands on the new one", async () => {
      const { cloud, account, sessions } = setUp(Date.now() + 59_000);

      await Promise.all([
        account.createClient(DEVICE_ID),
        account.createClient(DEVICE_ID),
      ]);

      expect(
        cloud.requests.filter(({ path }) => path.startsWith("/v1.0/m/token/")),
      ).toHaveLength(1);
      expect(sessions).toEqual([
        {
          endpoint: cloud.endpoint,
          accessToken: "access-2",
          refreshToken: "refresh-2",
          expiresAtInMs: expect.any(Number),
        },
      ]);
      expect(sessions[0]?.expiresAtInMs).toBeGreaterThan(
        Date.now() + 7_000_000,
      );
      expect(cloud.badSignatures).toEqual([]);
    });

    it("refreshes once and sends again when the cloud refuses the session", async () => {
      const { cloud, account, sessions } = setUp();
      cloud.accessTokenExpired = true;

      await account.createClient(DEVICE_ID);

      expect(sessions.map(({ accessToken }) => accessToken)).toEqual([
        "access-2",
      ]);
    });

    it("rejects with SESSION_EXPIRED when the refresh is refused", async () => {
      const { cloud, account, sessions } = setUp();
      cloud.accessTokenExpired = true;
      cloud.refreshToken = "spent-elsewhere";

      await expect(account.createClient(DEVICE_ID)).rejects.toMatchObject({
        code: "SESSION_EXPIRED",
      });
      expect(sessions).toEqual([]);
    });
  });

  describe("errors", () => {
    it("rejects with RATE_LIMITED when the cloud refuses a request over its rate limit", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", "/v1.0/m/life/users/homes", () => RATE_LIMITED);

      await expect(account.listDevices()).rejects.toMatchObject({
        code: "RATE_LIMITED",
      });
    });

    it("rejects with RATE_LIMITED on HTTP 429", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", "/v1.0/m/life/users/homes", () => ({ status: 429 }));

      await expect(account.listDevices()).rejects.toMatchObject({
        code: "RATE_LIMITED",
      });
    });

    it("rejects with REQUEST_REJECTED on another error", async () => {
      const { cloud, account } = setUp();
      const client = await account.createClient(DEVICE_ID);
      cloud.on(
        "POST",
        `/v1.1/m/thing/${DEVICE_ID}/commands`,
        () => COMMAND_NOT_SUPPORTED,
      );

      await expect(client.writeDataPoints({ "1": true })).rejects.toMatchObject(
        { code: "REQUEST_REJECTED" },
      );
    });

    it("rejects with REQUEST_REJECTED when a result lacks what the request needs", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", "/v1.0/m/life/users/homes", () => ({ result: null }));
      const client = await account.createClient(DEVICE_ID);
      cloud.on("GET", "/v1.0/m/life/ha/devices/detail", () => ({ result: "" }));

      await expect(account.listDevices()).rejects.toMatchObject({
        code: "REQUEST_REJECTED",
      });
      await expect(client.readDataPoints()).rejects.toMatchObject({
        code: "REQUEST_REJECTED",
      });
    });

    it("rejects with REQUEST_TIMED_OUT when the cloud does not answer within 10 s", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", "/v1.0/m/life/users/homes", () => new Promise(() => {}));
      useFakeTimers();

      const listing = account.listDevices();
      const rejected = expect(listing).rejects.toMatchObject({
        code: "REQUEST_TIMED_OUT",
      });
      await vi.advanceTimersByTimeAsync(10_000);

      await rejected;
    });

    it("rejects a request with CONNECTION_LOST once the account is closed", async () => {
      const { account } = setUp();

      await account.close();

      await expect(account.listDevices()).rejects.toMatchObject({
        code: "CONNECTION_LOST",
      });
    });
  });
});
