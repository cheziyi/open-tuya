import { createDecipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BROADCAST_KEY,
  V31_CONTROL,
  V31_CONTROL_ACK,
  V31_CONTROL_PLAINTEXT,
  V31_KEY,
  V31_QUERY,
  V31_QUERY_ERROR,
  V31_QUERY_REPLY,
  V31_QUERY_REPLY_PLAINTEXT,
  V31_STATUS,
  V31_STATUS_PLAINTEXT,
  V32_KEY,
  V32_NULL_READ,
  V32_NULL_READ_ACK,
  V32_NULL_READ_PLAINTEXT,
  V32_QUERY_ERROR,
  V32_STATUS,
  V32_STATUS_PLAINTEXT,
  V33_BROADCAST,
  V33_BROADCAST_PLAINTEXT,
  V33_QUERY_ERROR,
  V33_QUERY_ERROR_KEY,
  V33_QUERY_ERROR_PLAINTEXT,
  V33_REFUSED_QUERY,
  V33_REFUSING_KEY,
  V35_BROADCAST,
  V35_BROADCAST_PLAINTEXT,
  V35_STATUS_PLAINTEXT as V35_CAPTURED_STATUS_PLAINTEXT,
  V35_QUERY,
  V35_QUERY_ERROR,
  V35_QUERY_ERROR_PLAINTEXT,
  V35_QUERY_SESSION_KEY,
  V35_STATUS_VERSION_HEADER,
} from "../../../../local/src/protocol/__tests__/fixtures/capturedFrames.js";
import {
  CONTROL_PLAINTEXT,
  LOCAL_KEY,
  LOCAL_NONCE,
  SESSION_KEY_RESPONSE,
  STATUS_PLAINTEXT,
  V33_CONTROL,
  V33_STATUS,
  V34_CONTROL_NEW,
  V34_CONTROL_NEW_PLAINTEXT,
  V34_HEART_BEAT,
  V34_SESSION_KEY,
  V34_SESSION_KEY_RESPONSE,
  V34_SESSION_KEY_START,
  V34_STATUS,
  V35_HEART_BEAT,
  V35_IV,
  V35_SESSION_KEY,
  V35_SESSION_KEY_RESPONSE,
  V35_SESSION_KEY_START,
  V35_STATUS,
} from "../../../../local/src/protocol/__tests__/fixtures/computedFrames.js";
import { openClientFrame, sealDeviceFrame } from "../frames.js";

const NO_IV = Buffer.alloc(0);
const ZERO_FIELDS = { serialNumber: 0, sourceId: 0 };

describe("sealDeviceFrame", () => {
  it.each([
    [
      "a captured 3.3 broadcast",
      "3.3",
      { sequenceNumber: 0, command: 0x13, plaintext: V33_BROADCAST_PLAINTEXT },
      BROADCAST_KEY,
      NO_IV,
      false,
      V33_BROADCAST,
    ],
    [
      "a captured 3.5 broadcast",
      "3.5",
      { sequenceNumber: 0, command: 0x13, plaintext: V35_BROADCAST_PLAINTEXT },
      BROADCAST_KEY,
      V35_BROADCAST.subarray(18, 30),
      false,
      V35_BROADCAST,
    ],
    [
      "a 3.3 STATUS",
      "3.3",
      { sequenceNumber: 0, command: 0x08, plaintext: STATUS_PLAINTEXT },
      LOCAL_KEY,
      NO_IV,
      true,
      V33_STATUS,
    ],
    [
      "a 3.4 STATUS",
      "3.4",
      { sequenceNumber: 7, command: 0x08, plaintext: STATUS_PLAINTEXT },
      LOCAL_KEY,
      NO_IV,
      true,
      V34_STATUS,
    ],
    [
      "a 3.5 STATUS",
      "3.5",
      { sequenceNumber: 0xed66, command: 0x08, plaintext: STATUS_PLAINTEXT },
      V35_SESSION_KEY,
      V35_IV,
      true,
      V35_STATUS,
    ],
    [
      "a 3.4 SESS_KEY_NEG_RESP",
      "3.4",
      {
        sequenceNumber: 0x9f70,
        command: 0x04,
        plaintext: SESSION_KEY_RESPONSE,
      },
      LOCAL_KEY,
      NO_IV,
      false,
      V34_SESSION_KEY_RESPONSE,
    ],
    [
      "a 3.5 SESS_KEY_NEG_RESP",
      "3.5",
      {
        sequenceNumber: 0xed65,
        command: 0x04,
        plaintext: SESSION_KEY_RESPONSE,
      },
      LOCAL_KEY,
      V35_IV,
      false,
      V35_SESSION_KEY_RESPONSE,
    ],
  ] as const)(
    "writes %s byte for byte",
    (_name, version, frame, key, iv, versionHeader, expected) => {
      expect(
        sealDeviceFrame(
          version,
          {
            ...frame,
            plaintext: Buffer.from(frame.plaintext),
            returnCode: 0,
            versionHeader: versionHeader ? ZERO_FIELDS : undefined,
          },
          key,
          iv,
        ),
      ).toEqual(expected);
    },
  );
});

describe("sealDeviceFrame, against a captured error", () => {
  it.each([
    [
      "3.3",
      { sequenceNumber: 1, command: 0x0a },
      V33_QUERY_ERROR_PLAINTEXT,
      V33_QUERY_ERROR_KEY,
      NO_IV,
      V33_QUERY_ERROR,
    ],
    [
      "3.5",
      { sequenceNumber: 0xf216, command: 0x10 },
      V35_QUERY_ERROR_PLAINTEXT,
      V35_QUERY_SESSION_KEY,
      V35_QUERY_ERROR.subarray(18, 30),
      V35_QUERY_ERROR,
    ],
  ] as const)(
    "writes a %s device's error byte for byte, return code 1",
    (version, frame, text, key, iv, expected) => {
      expect(
        sealDeviceFrame(
          version,
          {
            ...frame,
            returnCode: 1,
            plaintext: Buffer.from(text),
          },
          key,
          iv,
        ),
      ).toEqual(expected);
    },
  );
});

describe("sealDeviceFrame, against a captured plaintext", () => {
  it("puts a 3.5 STATUS's return code and version header as a device does", () => {
    const frame = sealDeviceFrame(
      "3.5",
      {
        sequenceNumber: 0,
        command: 0x08,
        returnCode: 0,
        plaintext: Buffer.from(V35_CAPTURED_STATUS_PLAINTEXT),
        versionHeader: { serialNumber: 0x3561, sourceId: 1 },
      },
      V35_SESSION_KEY,
      V35_IV,
    );
    const decipher = createDecipheriv(
      "aes-128-gcm",
      V35_SESSION_KEY,
      frame.subarray(18, 30),
    );
    decipher.setAAD(frame.subarray(4, 18));
    decipher.setAuthTag(frame.subarray(-20, -4));

    expect(
      Buffer.concat([
        decipher.update(frame.subarray(30, -20)),
        decipher.final(),
      ]),
    ).toEqual(
      Buffer.concat([
        Buffer.alloc(4),
        V35_STATUS_VERSION_HEADER,
        Buffer.from(V35_CAPTURED_STATUS_PLAINTEXT),
      ]),
    );
  });
});

describe("openClientFrame", () => {
  it("reads the serial number and source ID in a version header", () => {
    expect(
      openClientFrame("3.4", V34_CONTROL_NEW, LOCAL_KEY)?.frame.versionHeader,
    ).toEqual(ZERO_FIELDS);
  });

  it("reads the DP_QUERY_NEW a client sent a 3.5 device", () => {
    expect(openClientFrame("3.5", V35_QUERY, V35_QUERY_SESSION_KEY)).toEqual({
      frame: { sequenceNumber: 3, command: 0x10, payload: Buffer.from("{}") },
      rest: Buffer.alloc(0),
    });
  });

  it.each([
    ["3.3", V33_CONTROL, LOCAL_KEY, 2, 0x07, Buffer.from(CONTROL_PLAINTEXT)],
    ["3.4", V34_SESSION_KEY_START, LOCAL_KEY, 1, 0x03, LOCAL_NONCE],
    [
      "3.4",
      V34_CONTROL_NEW,
      LOCAL_KEY,
      3,
      0x0d,
      Buffer.from(V34_CONTROL_NEW_PLAINTEXT),
    ],
    ["3.4", V34_HEART_BEAT, V34_SESSION_KEY, 3, 0x09, Buffer.alloc(0)],
    ["3.5", V35_SESSION_KEY_START, LOCAL_KEY, 1, 0x03, LOCAL_NONCE],
    ["3.5", V35_HEART_BEAT, V35_SESSION_KEY, 3, 0x09, Buffer.alloc(0)],
  ] as const)(
    "reads a %s client frame with command %i",
    (version, bytes, key, sequenceNumber, command, payload) => {
      expect(openClientFrame(version, bytes, key)).toMatchObject({
        frame: { sequenceNumber, command, payload },
        rest: Buffer.alloc(0),
      });
    },
  );

  it("returns undefined for a frame not yet whole", () => {
    expect(
      openClientFrame("3.4", V34_HEART_BEAT.subarray(0, 30), V34_SESSION_KEY),
    ).toBeUndefined();
  });

  it("returns the bytes after the frame as the rest", () => {
    expect(
      openClientFrame(
        "3.4",
        Buffer.concat([V34_HEART_BEAT, V34_HEART_BEAT]),
        V34_SESSION_KEY,
      )?.rest,
    ).toEqual(V34_HEART_BEAT);
  });

  it("throws on a frame whose HMAC is wrong", () => {
    expect(() => openClientFrame("3.4", V34_HEART_BEAT, LOCAL_KEY)).toThrow();
  });
});

describe("a 3.1 device, against a captured exchange", () => {
  it.each([
    [
      "its reply to a query",
      1,
      0x0a,
      0,
      V31_QUERY_REPLY_PLAINTEXT,
      V31_QUERY_REPLY,
    ],
    ["its error", 1, 0x0a, 1, "data format error", V31_QUERY_ERROR],
    ["its ack", 2, 0x07, 0, "", V31_CONTROL_ACK],
    ["its STATUS, sealed", 0, 0x08, 0, V31_STATUS_PLAINTEXT, V31_STATUS],
  ] as const)(
    "writes %s byte for byte",
    (_name, sequenceNumber, command, returnCode, text, expected) => {
      expect(
        sealDeviceFrame(
          "3.1",
          { sequenceNumber, command, returnCode, plaintext: Buffer.from(text) },
          V31_KEY,
          NO_IV,
        ),
      ).toEqual(expected);
    },
  );

  it("reads a client's sealed CONTROL and its plain DP_QUERY", () => {
    const control = openClientFrame("3.1", V31_CONTROL, V31_KEY)?.frame;
    const query = openClientFrame("3.1", V31_QUERY, V31_KEY)?.frame;

    expect(control?.payload.toString()).toBe(V31_CONTROL_PLAINTEXT);
    expect(JSON.parse(query?.payload.toString() ?? "")).toMatchObject({
      devId: "03200160ecfabc8d9700",
    });
  });

  it("throws on a CONTROL sealed under another key", () => {
    expect(() =>
      openClientFrame("3.1", V31_CONTROL, Buffer.from("0123456789abcdef")),
    ).toThrow();
  });
});

describe("a 3.2 device, against a captured exchange", () => {
  it.each([
    ["its ack", 1, 0x0d, 0, "", undefined, V32_NULL_READ_ACK],
    [
      "its error, in plain text",
      0,
      0x0a,
      1,
      "data format error",
      undefined,
      V32_QUERY_ERROR,
    ],
    [
      "its STATUS, sealed behind its version header",
      0,
      0x08,
      0,
      V32_STATUS_PLAINTEXT,
      { serialNumber: 0x17, sourceId: 1 },
      V32_STATUS,
    ],
  ] as const)(
    "writes %s byte for byte",
    (_name, sequenceNumber, command, returnCode, text, versionHeader, expected) => {
      expect(
        sealDeviceFrame(
          "3.2",
          {
            sequenceNumber,
            command,
            returnCode,
            plaintext: Buffer.from(text),
            ...(versionHeader && { versionHeader }),
          },
          V32_KEY,
          NO_IV,
        ),
      ).toEqual(expected);
    },
  );

  it("reads a client's sealed CONTROL_NEW", () => {
    expect(
      openClientFrame("3.2", V32_NULL_READ, V32_KEY)?.frame.payload.toString(),
    ).toBe(V32_NULL_READ_PLAINTEXT);
  });
});

describe("a 3.3 device that refuses a read, against a captured refusal", () => {
  it("writes its refusal byte for byte", () => {
    expect(
      sealDeviceFrame(
        "3.3",
        {
          sequenceNumber: 1,
          command: 0x0a,
          returnCode: 1,
          plaintext: Buffer.from("json obj data unvalid"),
        },
        V33_REFUSING_KEY,
        NO_IV,
      ),
    ).toEqual(V33_REFUSED_QUERY);
  });
});
