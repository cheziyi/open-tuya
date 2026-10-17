import { describe, expect, it } from "vitest";
import { decodePackets, PACKET_TYPES, parsePublish } from "../packet.js";

// A PUBLISH at QoS 0 of "ab" to topic "t": a fixed header, the remaining
// length, the topic's length and bytes, and the payload.
const PUBLISH = Buffer.from([0x30, 0x05, 0x00, 0x01, 0x74, 0x61, 0x62]);
const PINGRESP = Buffer.from([0xd0, 0x00]);

describe("decodePackets", () => {
  it("splits packets, and keeps the bytes of one not yet whole", () => {
    const decoded = decodePackets(
      Buffer.concat([PUBLISH, PINGRESP, PUBLISH.subarray(0, 3)]),
    );

    expect(decoded.packets.map(({ type }) => type)).toEqual([
      PACKET_TYPES.PUBLISH,
      PACKET_TYPES.PINGRESP,
    ]);
    expect(decoded.remainder).toEqual(PUBLISH.subarray(0, 3));
  });

  it("waits for the rest of a remaining length cut short", () => {
    const decoded = decodePackets(Buffer.from([0x30, 0x80]));

    expect(decoded.packets).toEqual([]);
    expect(decoded.remainder).toEqual(Buffer.from([0x30, 0x80]));
  });

  it("throws a RangeError for a remaining length past 4 bytes", () => {
    expect(() =>
      decodePackets(Buffer.from([0x30, 0xff, 0xff, 0xff, 0xff, 0x01])),
    ).toThrow(RangeError);
  });
});

describe("parsePublish", () => {
  it("reads the topic and the payload", () => {
    const [packet] = decodePackets(PUBLISH).packets;

    expect(
      parsePublish(packet?.flags ?? 0, packet?.body ?? Buffer.alloc(0)),
    ).toEqual({ topic: "t", payload: Buffer.from("ab") });
  });

  it("skips the packet ID of a PUBLISH at QoS 1", () => {
    const body = Buffer.from([0x00, 0x01, 0x74, 0x00, 0x07, 0x61, 0x62]);

    expect(parsePublish(0x02, body)).toEqual({
      topic: "t",
      payload: Buffer.from("ab"),
    });
  });
});
