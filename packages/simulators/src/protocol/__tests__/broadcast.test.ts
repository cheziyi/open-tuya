import { describe, expect, it } from "vitest";
import {
  V31_BROADCAST,
  V33_BROADCAST,
  V34_BROADCAST,
  V35_BROADCAST,
} from "../../../../local/src/protocol/__tests__/fixtures/capturedFrames.js";
import {
  DISCOVERY_REQUEST,
  DISCOVERY_REQUEST_IP,
} from "../../../../local/src/protocol/__tests__/fixtures/computedFrames.js";
import { openDiscoveryRequest, sealBroadcast } from "../broadcast.js";

const NO_IV = Buffer.alloc(0);

describe("sealBroadcast", () => {
  it.each([
    [
      "3.1",
      {
        ip: "192.168.2.81",
        gwId: "012001865ccf7f598277",
        uuid: "",
        productKey: "qHLNAzmrRdA9EMXl",
      },
      NO_IV,
      V31_BROADCAST,
    ],
    [
      "3.3",
      {
        ip: "192.168.1.39",
        gwId: "bf99cefbbe3b010080nunb",
        uuid: "",
        productKey: "keya4gvchmtapm8n",
      },
      NO_IV,
      V33_BROADCAST,
    ],
    [
      "3.4",
      {
        ip: "192.168.1.36",
        gwId: "bf36eb3bd9f27a4264yxu1",
        uuid: "",
        productKey: "key5ckdnys3pqgec",
      },
      NO_IV,
      V34_BROADCAST,
    ],
    [
      "3.5",
      {
        ip: "192.168.1.104",
        gwId: "bfb7475dbdef49284eu4xe",
        uuid: "678a6c23563c5e29",
        productKey: "key8u54q9dtru5jw",
      },
      V35_BROADCAST.subarray(18, 30),
      V35_BROADCAST,
    ],
  ] as const)(
    "builds the broadcast a %s device was captured sending",
    (version, fields, iv, captured) => {
      expect(sealBroadcast(version, fields, iv)).toEqual(captured);
    },
  );
});

describe("openDiscoveryRequest", () => {
  it("reads the address a request asks devices to answer to", () => {
    expect(openDiscoveryRequest(DISCOVERY_REQUEST)).toBe(DISCOVERY_REQUEST_IP);
  });

  it.each([
    ["a device's broadcast", V35_BROADCAST],
    ["a 3.3 broadcast", V33_BROADCAST],
    ["bytes that are not a frame", Buffer.from("not a request")],
  ])("leaves out %s", (_, datagram) => {
    expect(openDiscoveryRequest(datagram)).toBeUndefined();
  });
});
