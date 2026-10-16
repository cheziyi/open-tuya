import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import { addVersionHeader, removeVersionHeader } from "../versionHeader.js";
import { V35_STATUS_VERSION_HEADER } from "./fixtures/capturedFrames.js";

const PAYLOAD = Buffer.from("{}");

describe("addVersionHeader", () => {
  it("writes the serial number and the source ID as a device does", () => {
    expect(
      addVersionHeader("3.5", COMMANDS.CONTROL_NEW, PAYLOAD, {
        serialNumber: 0x3561,
        sourceId: 1,
      }),
    ).toEqual(Buffer.concat([V35_STATUS_VERSION_HEADER, PAYLOAD]));
  });

  it("writes zeros after the version when given no fields", () => {
    expect(addVersionHeader("3.3", COMMANDS.CONTROL, PAYLOAD)).toEqual(
      Buffer.concat([Buffer.from("3.3"), Buffer.alloc(12), PAYLOAD]),
    );
  });

  it.each([
    COMMANDS.SESS_KEY_NEG_START,
    COMMANDS.SESS_KEY_NEG_FINISH,
    COMMANDS.HEART_BEAT,
    COMMANDS.DP_QUERY,
    COMMANDS.DP_QUERY_NEW,
    COMMANDS.UPDATEDPS,
    0x40,
  ])("leaves command %i without a header", (command) => {
    expect(addVersionHeader("3.4", command, PAYLOAD)).toEqual(PAYLOAD);
  });
});

describe("removeVersionHeader", () => {
  it("drops a device's header, whatever its fields hold", () => {
    expect(
      removeVersionHeader(
        "3.5",
        Buffer.concat([V35_STATUS_VERSION_HEADER, PAYLOAD]),
      ),
    ).toEqual(PAYLOAD);
  });
});
