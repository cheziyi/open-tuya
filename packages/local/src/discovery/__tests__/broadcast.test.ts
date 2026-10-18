import { describe, expect, it } from "vitest";
import {
  BROADCAST_KEY,
  V31_BROADCAST,
  V33_BROADCAST,
  V34_BROADCAST,
  V35_BROADCAST,
  V35_BULB_BROADCAST,
} from "../../protocol/__tests__/fixtures/capturedFrames.js";
import { DISCOVERY_REQUEST } from "../../protocol/__tests__/fixtures/computedFrames.js";
import { encryptAesEcb } from "../../protocol/aesEcb.js";
import { encodeFrame } from "../../protocol/frame.js";
import { decodeBroadcast } from "../broadcast.js";

// A 0x55AA frame as a device sends it: a return code of 0, then the payload.
function deviceFrame(command: number, payload: Uint8Array): Buffer {
  return encodeFrame({
    sequenceNumber: 0,
    command,
    payload: Buffer.concat([Buffer.alloc(4), payload]),
  });
}

function encrypted(message: unknown): Buffer {
  return encryptAesEcb(Buffer.from(JSON.stringify(message)), BROADCAST_KEY);
}

const DEVICE = {
  ip: "192.168.1.39",
  gwId: "bf99cefbbe3b010080nunb",
  productKey: "keya4gvchmtapm8n",
  version: "3.3",
};

describe("decodeBroadcast", () => {
  it.each([
    [
      "3.1",
      V31_BROADCAST,
      {
        host: "192.168.2.81",
        deviceId: "012001865ccf7f598277",
        version: "3.1",
        productKey: "qHLNAzmrRdA9EMXl",
      },
    ],
    [
      "3.3",
      V33_BROADCAST,
      {
        host: "192.168.1.39",
        deviceId: "bf99cefbbe3b010080nunb",
        version: "3.3",
        productKey: "keya4gvchmtapm8n",
      },
    ],
    [
      "3.4",
      V34_BROADCAST,
      {
        host: "192.168.1.36",
        deviceId: "bf36eb3bd9f27a4264yxu1",
        version: "3.4",
        productKey: "key5ckdnys3pqgec",
      },
    ],
    [
      "3.5",
      V35_BROADCAST,
      {
        host: "192.168.1.104",
        deviceId: "bfb7475dbdef49284eu4xe",
        version: "3.5",
        productKey: "key8u54q9dtru5jw",
      },
    ],
    [
      "3.5 bulb",
      V35_BULB_BROADCAST,
      {
        host: "192.168.2.46",
        deviceId: "ebf310edb88d15f0edyr5i",
        version: "3.5",
        productKey: "key8u54q9dtru5jw",
      },
    ],
  ])("reads a captured %s broadcast", (_, datagram, device) => {
    expect(decodeBroadcast(datagram)).toEqual(device);
  });

  it("leaves out a client's request, which arrives on the same port", () => {
    expect(decodeBroadcast(DISCOVERY_REQUEST)).toBeUndefined();
  });

  it("leaves out a broadcast whose CRC is wrong", () => {
    const datagram = Buffer.from(V33_BROADCAST);
    datagram.writeUInt32BE(0xdeadbeef, datagram.length - 8);

    expect(decodeBroadcast(datagram)).toBeUndefined();
  });

  it("leaves out a broadcast whose tag is wrong", () => {
    const datagram = Buffer.from(V35_BROADCAST);
    datagram.writeUInt32BE(0xdeadbeef, datagram.length - 8);

    expect(decodeBroadcast(datagram)).toBeUndefined();
  });

  it.each([
    ["empty", Buffer.alloc(0)],
    ["not a frame", Buffer.from("M-SEARCH * HTTP/1.1\r\n\r\n")],
    ["cut short", V33_BROADCAST.subarray(0, 100)],
    [
      "with a length field out of range",
      Buffer.from("000055aa00000000000000130000000000000000", "hex"),
    ],
  ])("leaves out a datagram %s", (_, datagram) => {
    expect(decodeBroadcast(datagram)).toBeUndefined();
  });

  it("leaves out a frame of another command", () => {
    expect(
      decodeBroadcast(deviceFrame(0x08, encrypted(DEVICE))),
    ).toBeUndefined();
  });

  it("reads a broadcast of either command, whatever the version it names", () => {
    expect(
      decodeBroadcast(
        deviceFrame(0x23, encrypted({ ...DEVICE, version: "3.3" })),
      ),
    ).toMatchObject({ version: "3.3" });
  });

  it.each(["3.2", "3.6", 3.3, undefined])(
    "leaves out a device of version %s",
    (version) => {
      expect(
        decodeBroadcast(deviceFrame(0x13, encrypted({ ...DEVICE, version }))),
      ).toBeUndefined();
    },
  );

  it.each(["ip", "gwId", "productKey"])(
    "leaves out a broadcast without %s",
    (field) => {
      const message: Record<string, unknown> = { ...DEVICE };
      delete message[field];

      expect(
        decodeBroadcast(deviceFrame(0x13, encrypted(message))),
      ).toBeUndefined();
    },
  );

  it.each([
    ["JSON that is not an object", encrypted(null)],
    [
      "text that is not JSON",
      encryptAesEcb(Buffer.from("not json"), BROADCAST_KEY),
    ],
    ["a payload that does not decrypt", Buffer.from(DEVICE.gwId)],
  ])("leaves out a broadcast carrying %s", (_, payload) => {
    expect(decodeBroadcast(deviceFrame(0x13, payload))).toBeUndefined();
  });
});
