import type { DataPoints } from "@open-tuya/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeveloperCloudAccount } from "../account.js";
import { openMqttConnection } from "../mqtt.js";
import { until, useFakeTimers } from "./clock.js";
import { type Broker, startBroker } from "./mocks/broker.js";
import {
  encryptPushMessage,
  FakeDeveloperCloud,
} from "./mocks/fakeDeveloperCloud.js";

const ACCESS_ID = "abcdefghij0123456789";
const ACCESS_SECRET = "0123456789abcdef0123456789abcdef";
const DEVICE_ID = "bf6c8539693b0cdea25thg";
const PASSWORD = "0123456789abcdefFEDCBA9876543210";
const TOPIC = "cloud/token/in/abcdefghij0123456789";

// Source: The shape of an associated-users device, as captured in
// https://github.com/tuya/tuya-homebridge/issues/339, with its key and IDs
// made up.
const DEVICE_RECORD = {
  active_time: 1625353812,
  category: "cz",
  id: DEVICE_ID,
  ip: "203.0.113.7",
  local_key: "0123456789abcdef",
  name: "Plug",
  online: true,
  product_id: "na90jncjlvw5t0ba",
  product_name: "Smart Plug",
  status: [{ code: "switch_1", value: true }],
  sub: false,
  uid: "eu1625675520120AYG2O",
  uuid: "0420030268c63ab00bb0",
};

// Source: A thing model's shape, as captured in
// https://github.com/jasonacox/tinytuya/issues/577.
const MODEL = {
  modelId: "000000tdg4",
  services: [
    {
      actions: [],
      code: "",
      description: "",
      events: [],
      name: "默认服务",
      properties: [
        {
          abilityId: 1,
          accessMode: "rw",
          code: "switch_1",
          description: "",
          name: "开关1",
          typeSpec: { type: "bool" },
        },
        {
          abilityId: 20,
          accessMode: "ro",
          code: "cur_voltage",
          description: "",
          name: "当前电压",
          typeSpec: {
            max: 5000,
            min: 0,
            scale: 1,
            step: 1,
            type: "value",
            unit: "V",
          },
        },
      ],
    },
  ],
};

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function setUp(): {
  cloud: FakeDeveloperCloud;
  account: DeveloperCloudAccount;
} {
  const cloud = new FakeDeveloperCloud(ACCESS_ID, ACCESS_SECRET);
  const account = new DeveloperCloudAccount(cloud.fetch, openMqttConnection, {
    accessId: ACCESS_ID,
    accessSecret: ACCESS_SECRET,
    dataCenter: "eu",
  });
  cleanups.push(() => account.close());
  cloud.on("GET", `/v2.0/cloud/thing/${DEVICE_ID}/model`, () => ({
    result: { model: JSON.stringify(MODEL) },
  }));
  // Source: The shadow's shape, as captured in
  // https://github.com/xZetsubou/hass-localtuya/issues/782#issuecomment-3958114610.
  cloud.on("GET", `/v2.0/cloud/thing/${DEVICE_ID}/shadow/properties`, () => ({
    result: {
      properties: [
        {
          code: "switch_1",
          custom_name: "",
          dp_id: 1,
          time: 1772013440477,
          type: "bool",
          value: true,
        },
        {
          code: "cur_voltage",
          custom_name: "",
          dp_id: 20,
          time: 1772013440477,
          type: "value",
          value: 2298,
        },
      ],
    },
  }));
  cloud.on(
    "POST",
    `/v2.0/cloud/thing/${DEVICE_ID}/shadow/properties/issue`,
    () => ({ result: true }),
  );
  return { cloud, account };
}

async function serveBroker(cloud: FakeDeveloperCloud): Promise<Broker> {
  const broker = await startBroker();
  cleanups.push(() => broker.close());
  cloud.on("POST", "/v1.0/iot-03/open-hub/access-config", () => ({
    result: {
      client_id: "cloud_client",
      expire_time: 7200,
      password: PASSWORD,
      sink_topic: { device: "cloud/token/out/abcdefghij0123456789" },
      source_topic: { device: TOPIC },
      url: broker.url,
      username: "cloud_user",
    },
  }));
  return broker;
}

describe("DeveloperCloudAccount", () => {
  describe("listDevices", () => {
    it("lists every linked account's devices, a page at a time", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", "/v1.0/iot-01/associated-users/devices", (request) => ({
        result: request.query.last_row_key
          ? {
              devices: [{ ...DEVICE_RECORD, id: "bf2" }],
              has_more: false,
              last_row_key: "B",
              total: 2,
            }
          : {
              devices: [DEVICE_RECORD],
              has_more: true,
              last_row_key: "A",
              total: 2,
            },
      }));

      await expect(account.listDevices()).resolves.toEqual([
        {
          deviceId: DEVICE_ID,
          name: "Plug",
          productKey: "na90jncjlvw5t0ba",
          localKey: "0123456789abcdef",
          category: "cz",
          online: true,
        },
        expect.objectContaining({ deviceId: "bf2" }),
      ]);
      expect(cloud.requests.map(({ path, query }) => [path, query])).toEqual([
        ["/v1.0/token", { grant_type: "1" }],
        ["/v1.0/iot-01/associated-users/devices", { size: "50" }],
        [
          "/v1.0/iot-01/associated-users/devices",
          { size: "50", last_row_key: "A" },
        ],
      ]);
      expect(cloud.badSignatures).toEqual([]);
    });

    it("takes a missing local key from the list of the device's own account", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", "/v1.0/iot-01/associated-users/devices", () => ({
        result: {
          devices: [
            DEVICE_RECORD,
            { ...DEVICE_RECORD, id: "bf2", local_key: "" },
            { ...DEVICE_RECORD, id: "bf3", local_key: undefined },
          ],
          has_more: false,
          last_row_key: "A",
        },
      }));
      cloud.on("GET", "/v1.3/iot-03/devices", (request) => ({
        result: request.query.last_row_key
          ? {
              list: [{ ...DEVICE_RECORD, id: "bf3", local_key: "bf3key" }],
              has_more: false,
            }
          : {
              list: [{ ...DEVICE_RECORD, id: "bf2", local_key: "bf2key" }],
              has_more: true,
              last_row_key: "L",
            },
      }));

      const devices = await account.listDevices();

      expect(
        devices.map(({ deviceId, localKey }) => [deviceId, localKey]),
      ).toEqual([
        [DEVICE_ID, "0123456789abcdef"],
        ["bf2", "bf2key"],
        ["bf3", "bf3key"],
      ]);
      expect(
        cloud.requests
          .filter(({ path }) => path === "/v1.3/iot-03/devices")
          .map(({ query }) => query),
      ).toEqual([
        {
          page_size: "75",
          source_type: "tuyaUser",
          source_id: "eu1625675520120AYG2O",
        },
        {
          page_size: "75",
          source_type: "tuyaUser",
          source_id: "eu1625675520120AYG2O",
          last_row_key: "L",
        },
      ]);
      expect(cloud.badSignatures).toEqual([]);
    });

    it("leaves a local key out when the project may not list the device's account", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", "/v1.0/iot-01/associated-users/devices", () => ({
        result: { devices: [{ ...DEVICE_RECORD, local_key: "" }] },
      }));
      cloud.on("GET", "/v1.3/iot-03/devices", () => ({
        code: 1106,
        msg: "permission deny",
      }));

      const devices = await account.listDevices();

      expect(devices).toEqual([
        expect.not.objectContaining({ localKey: expect.anything() }),
      ]);
    });

    it("rejects with REQUEST_REJECTED when the cloud answers with a page again", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", "/v1.0/iot-01/associated-users/devices", () => ({
        result: { devices: [DEVICE_RECORD], has_more: true, last_row_key: "A" },
      }));

      await expect(account.listDevices()).rejects.toMatchObject({
        code: "REQUEST_REJECTED",
      });
    });

    it("lists one account's devices through a device of it", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", `/v1.0/devices/${DEVICE_ID}`, () => ({
        result: { ...DEVICE_RECORD, uid: "eu1625675520120AYG2O" },
      }));
      cloud.on("GET", "/v1.0/users/eu1625675520120AYG2O/devices", () => ({
        result: [{ ...DEVICE_RECORD, node_id: "30 5C 12 5B", sub: true }],
      }));

      const devices = await account.listDevices({ viaDeviceId: DEVICE_ID });

      expect(devices).toEqual([
        expect.objectContaining({ deviceId: DEVICE_ID, nodeId: "30 5C 12 5B" }),
      ]);
    });

    it("rejects with REQUEST_REJECTED when the device's detail has no uid", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", `/v1.0/devices/${DEVICE_ID}`, () => ({
        result: { ...DEVICE_RECORD, uid: undefined },
      }));

      await expect(
        account.listDevices({ viaDeviceId: DEVICE_ID }),
      ).rejects.toMatchObject({ code: "REQUEST_REJECTED" });
      expect(cloud.requests.at(-1)?.path).toBe(`/v1.0/devices/${DEVICE_ID}`);
    });

    it("rejects with PERMISSION_DENIED when the project may not list them", async () => {
      const { cloud, account } = setUp();
      // Source: Captured in https://github.com/jasonacox/tinytuya/issues/330.
      cloud.on("GET", "/v1.0/iot-01/associated-users/devices", () => ({
        code: 1106,
        msg: "permission deny",
      }));

      await expect(account.listDevices()).rejects.toMatchObject({
        code: "PERMISSION_DENIED",
      });
    });
  });

  describe("readDeviceModel", () => {
    it("describes each property of the thing model by its code, with its type and values", async () => {
      const { account } = setUp();

      await expect(account.readDeviceModel(DEVICE_ID)).resolves.toEqual({
        "1": { code: "switch_1", type: "boolean" },
        "20": {
          code: "cur_voltage",
          type: "integer",
          min: 0,
          max: 5000,
          step: 1,
          scale: 1,
          unit: "V",
        },
      });
    });

    it("leaves out a property of another type, and values not of their type", async () => {
      const { cloud, account } = setUp();
      const [property] = MODEL.services[0].properties;
      cloud.on("GET", `/v2.0/cloud/thing/${DEVICE_ID}/model`, () => ({
        result: {
          model: JSON.stringify({
            services: [
              {
                properties: [
                  { ...property, abilityId: 1, typeSpec: { type: "float" } },
                  { ...property, abilityId: 2, typeSpec: null },
                  {
                    ...property,
                    abilityId: 3,
                    code: "mode",
                    typeSpec: { type: "enum", range: ["eco", 2], unit: "" },
                  },
                  {
                    ...property,
                    abilityId: 4,
                    code: "work_mode",
                    typeSpec: { type: "enum", range: ["eco", "boost"] },
                  },
                  {
                    ...property,
                    abilityId: 5,
                    code: "countdown",
                    typeSpec: { type: "value", min: "0", scale: null },
                  },
                  {
                    ...property,
                    abilityId: 6,
                    code: "temp_current",
                    typeSpec: {
                      type: "value",
                      min: "1.5",
                      max: "1e3",
                      scale: "0x10",
                      step: 2.5,
                    },
                  },
                  {
                    code: "no_ability_id",
                    typeSpec: { type: "bool" },
                  },
                ],
              },
            ],
          }),
        },
      }));

      await expect(account.readDeviceModel(DEVICE_ID)).resolves.toEqual({
        "3": { code: "mode", type: "enum" },
        "4": { code: "work_mode", type: "enum", range: ["eco", "boost"] },
        "5": { code: "countdown", type: "integer", min: 0 },
        "6": { code: "temp_current", type: "integer" },
      });
    });

    it("rejects with REQUEST_REJECTED when the thing model is not JSON", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", `/v2.0/cloud/thing/${DEVICE_ID}/model`, () => ({
        result: { model: "{" },
      }));

      await expect(account.readDeviceModel(DEVICE_ID)).rejects.toMatchObject({
        code: "REQUEST_REJECTED",
      });
    });
  });

  describe("DeveloperCloudTuyaClient", () => {
    it("reads the thing shadow by data point ID, with the device's values", async () => {
      const { account } = setUp();
      const client = await account.createClient(DEVICE_ID);

      await expect(client.readDataPoints()).resolves.toEqual({
        "1": true,
        "20": 2298,
      });
    });

    it("leaves out a shadow property with no data point ID", async () => {
      const { cloud, account } = setUp();
      cloud.on(
        "GET",
        `/v2.0/cloud/thing/${DEVICE_ID}/shadow/properties`,
        () => ({
          result: {
            properties: [
              { code: "switch_1", dp_id: 1, value: true },
              { code: "cloud_only", dp_id: null, value: 3 },
            ],
          },
        }),
      );
      const client = await account.createClient(DEVICE_ID);

      await expect(client.readDataPoints()).resolves.toEqual({ "1": true });
    });

    it("issues properties by code, as an object", async () => {
      const { cloud, account } = setUp();
      const client = await account.createClient(DEVICE_ID);

      await client.writeDataPoints({ "1": false });

      expect(cloud.requests.at(-1)?.body).toEqual({
        properties: { switch_1: false },
      });
      expect(cloud.badSignatures).toEqual([]);
    });

    it("rejects with REQUEST_REJECTED when the thing model is not JSON", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", `/v2.0/cloud/thing/${DEVICE_ID}/model`, () => ({
        result: { model: "{" },
      }));

      await expect(account.createClient(DEVICE_ID)).rejects.toMatchObject({
        code: "REQUEST_REJECTED",
      });
    });

    it("rejects a write to a data point outside the thing model with UNMAPPED_DATA_POINT, sending nothing", async () => {
      const { cloud, account } = setUp();
      const client = await account.createClient(DEVICE_ID);

      await expect(
        client.writeDataPoints({ "1": true, "9": 1 }),
      ).rejects.toMatchObject({
        code: "UNMAPPED_DATA_POINT",
      });
      expect(cloud.requests.some(({ path }) => path.endsWith("/issue"))).toBe(
        false,
      );
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

  describe("tokens", () => {
    it("takes one token for requests sent together", async () => {
      const { cloud, account } = setUp();

      await Promise.all([
        account.createClient(DEVICE_ID),
        account.createClient(DEVICE_ID),
      ]);

      expect(cloud.tokensIssued()).toBe(1);
    });

    it("takes a new token a minute before the last expires", async () => {
      const { cloud, account } = setUp();
      cloud.expireTimeInSeconds = 61;
      await account.createClient(DEVICE_ID);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 1000);

      await account.createClient(DEVICE_ID);

      expect(cloud.tokensIssued()).toBe(2);
    });

    it("takes a new token and sends again when the cloud refuses the token", async () => {
      const { cloud, account } = setUp();
      await account.createClient(DEVICE_ID);
      cloud.tokenExpired = true;

      await account.createClient(DEVICE_ID);

      expect(cloud.tokensIssued()).toBe(2);
    });

    it("rejects with PERMISSION_DENIED when the project's subscription lapsed", async () => {
      const { cloud, account } = setUp();
      // Source: Captured in https://github.com/jasonacox/tinytuya/issues/346.
      cloud.tokenFailures.push({
        code: 28841002,
        msg: "No permissions. Your subscription to cloud development plan has expired.",
      });

      await expect(account.createClient(DEVICE_ID)).rejects.toMatchObject({
        code: "PERMISSION_DENIED",
      });
    });

    it("rejects with REQUEST_REJECTED when the token has no lifetime", async () => {
      const { cloud, account } = setUp();
      cloud.expireTimeInSeconds = 0;

      await expect(account.createClient(DEVICE_ID)).rejects.toMatchObject({
        code: "REQUEST_REJECTED",
      });
    });

    it("rejects with REQUEST_REJECTED when the secret is wrong", async () => {
      const cloud = new FakeDeveloperCloud(ACCESS_ID, ACCESS_SECRET);
      const account = new DeveloperCloudAccount(
        cloud.fetch,
        openMqttConnection,
        {
          accessId: ACCESS_ID,
          accessSecret: "wrong",
          dataCenter: "eu",
        },
      );
      cleanups.push(() => account.close());

      await expect(account.listDevices()).rejects.toMatchObject({
        code: "REQUEST_REJECTED",
      });
    });
  });

  describe("pushes", () => {
    it("connects with a client's first listener, not before", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);
      const client = await account.createClient(DEVICE_ID);
      await client.readDataPoints();

      expect(cloud.requests.some(({ path }) => path.includes("open-hub"))).toBe(
        false,
      );
      client.onDataPoints(() => {});
      await until(() => broker.subscriptions.length > 0);

      expect(broker.connects).toHaveLength(1);
    });

    it("disconnects with a client's last listener", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);
      let disconnects = 0;
      broker.aedes.on("clientDisconnect", () => disconnects++);
      const client = await account.createClient(DEVICE_ID);
      const removeFirst = client.onDataPoints(() => {});
      const removeSecond = client.onDataPoints(() => {});
      await until(() => broker.subscriptions.length > 0);

      removeFirst();
      removeFirst();
      expect(disconnects).toBe(0);
      removeSecond();
      await until(() => disconnects > 0);

      expect(client.connected).toBe(true);
    });

    it("asks for the project's MQTT credentials with the token's uid", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);

      const client = await account.createClient(DEVICE_ID);
      client.onDataPoints(() => {});
      await until(() => broker.subscriptions.length > 0);

      expect(
        cloud.requests.find(
          ({ path }) => path === "/v1.0/iot-03/open-hub/access-config",
        )?.body,
      ).toEqual({
        uid: cloud.uid,
        link_id: expect.any(String),
        link_type: "mqtt",
        topics: "device",
        msg_encrypted_version: "2.0",
      });
      expect(broker.subscriptions).toEqual([TOPIC]);
      expect(broker.connects).toEqual([
        {
          clientId: "cloud_client",
          username: "cloud_user",
          password: PASSWORD,
        },
      ]);
    });

    it("hands each listener its device's own values by data point ID", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);
      const client = await account.createClient(DEVICE_ID);
      const reports: DataPoints[] = [];
      client.onDataPoints((dataPoints) => reports.push(dataPoints));
      await until(() => broker.subscriptions.length > 0);

      // Source: The status entries, as captured in
      // https://github.com/tuya/tuya-home-assistant/issues/591 and
      // https://github.com/tuya/tuya-homebridge/issues/352.
      await broker.publish(
        TOPIC,
        encryptPushMessage(
          {
            devId: "bfother",
            status: [{ "1": false, code: "switch_1", value: false }],
          },
          PASSWORD,
          1636197093,
        ),
      );
      await broker.publish(
        TOPIC,
        '{"protocol":4,"data":"bm90IHNlYWxlZA==","t":1}',
      );
      await broker.publish(
        TOPIC,
        encryptPushMessage(
          {
            devId: DEVICE_ID,
            status: [
              {
                "24": "001703de0017",
                code: "colour_data_v2",
                t: "1636197093",
                value: '{"h":23,"s":990,"v":23}',
              },
              { "3": 76 },
            ],
          },
          PASSWORD,
          1636197093,
        ),
      );
      await until(() => reports.length > 0);

      expect(reports).toEqual([{ "24": "001703de0017", "3": 76 }]);
    });

    it("hands on a report that names no protocol", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);
      const client = await account.createClient(DEVICE_ID);
      const reports: DataPoints[] = [];
      client.onDataPoints((dataPoints) => reports.push(dataPoints));
      await until(() => broker.subscriptions.length > 0);

      await broker.publish(
        TOPIC,
        encryptPushMessage(
          { devId: DEVICE_ID, status: [{ "1": true }] },
          PASSWORD,
          1636197093,
          20,
        ),
      );
      await broker.publish(
        TOPIC,
        encryptPushMessage(
          { devId: DEVICE_ID, status: [{ "1": false }] },
          PASSWORD,
          1636197093,
          null,
        ),
      );
      await until(() => reports.length > 0);

      expect(reports).toEqual([{ "1": false }]);
    });

    it("asks for credentials again 5 s later when the cloud's lack a topic", async () => {
      const { cloud, account } = setUp();
      await serveBroker(cloud);
      cloud.on("POST", "/v1.0/iot-03/open-hub/access-config", () => ({
        result: {
          client_id: "cloud_client",
          expire_time: 7200,
          password: PASSWORD,
          url: "tcp://127.0.0.1:1",
          username: "cloud_user",
        },
      }));
      const configRequests = () =>
        cloud.requests.filter(({ path }) => path.includes("open-hub")).length;
      const client = await account.createClient(DEVICE_ID);
      useFakeTimers();

      client.onDataPoints(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(configRequests()).toBe(1);
      await vi.advanceTimersByTimeAsync(5000);

      expect(configRequests()).toBe(2);
    });

    it("closes the connection with its last client", async () => {
      const { cloud, account } = setUp();
      const broker = await serveBroker(cloud);
      let disconnects = 0;
      broker.aedes.on("clientDisconnect", () => disconnects++);
      const first = await account.createClient(DEVICE_ID);
      const second = await account.createClient(DEVICE_ID);
      first.onDataPoints(() => {});
      second.onDataPoints(() => {});
      await until(() => broker.subscriptions.length > 0);

      await first.close();
      expect(disconnects).toBe(0);
      await second.close();
      await until(() => disconnects > 0);

      expect(broker.connects).toHaveLength(1);
    });
  });

  describe("errors", () => {
    it("rejects with RATE_LIMITED on HTTP 429", async () => {
      const { cloud, account } = setUp();
      cloud.on("GET", "/v1.0/iot-01/associated-users/devices", () => ({
        status: 429,
      }));

      await expect(account.listDevices()).rejects.toMatchObject({
        code: "RATE_LIMITED",
      });
    });

    it("rejects with REQUEST_TIMED_OUT when the cloud does not answer within 10 s", async () => {
      const { cloud, account } = setUp();
      cloud.on(
        "GET",
        "/v1.0/iot-01/associated-users/devices",
        () => new Promise(() => {}),
      );
      useFakeTimers();

      const rejected = expect(account.listDevices()).rejects.toMatchObject({
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
