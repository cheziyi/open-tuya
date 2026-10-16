import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import { decodeV35Payload, encodeV35Payload } from "../v35Payload.js";

const V35_HEADER = Buffer.concat([Buffer.from("3.5"), Buffer.alloc(12)]);
const PLAINTEXT = Buffer.from('{"dps":{"1":true}}');

describe("encodeV35Payload", () => {
  it.each([
    COMMANDS.SESS_KEY_NEG_START,
    COMMANDS.SESS_KEY_NEG_FINISH,
    COMMANDS.HEART_BEAT,
    COMMANDS.DP_QUERY,
    COMMANDS.DP_QUERY_NEW,
    COMMANDS.UPDATEDPS,
  ])("sends command %i without the header", (command) => {
    expect(encodeV35Payload(command, PLAINTEXT)).toEqual(PLAINTEXT);
  });

  it.each([COMMANDS.CONTROL, COMMANDS.CONTROL_NEW])(
    "puts the header in front of command %i",
    (command) => {
      expect(encodeV35Payload(command, PLAINTEXT)).toEqual(
        Buffer.concat([V35_HEADER, PLAINTEXT]),
      );
    },
  );
});

describe("decodeV35Payload", () => {
  it("drops the header", () => {
    expect(decodeV35Payload(Buffer.concat([V35_HEADER, PLAINTEXT]))).toEqual(
      PLAINTEXT,
    );
  });

  it("returns a payload without the header as it is", () => {
    expect(decodeV35Payload(PLAINTEXT)).toEqual(PLAINTEXT);
  });
});
