import { describe, expect, it } from "vitest";
import {
  DISCOVERY_REQUEST,
  DISCOVERY_REQUEST_IP,
  DISCOVERY_REQUEST_IV,
} from "../../protocol/__tests__/fixtures/computedFrames.js";
import { encodeDiscoveryRequest } from "../request.js";

describe("encodeDiscoveryRequest", () => {
  it("builds the request tinytuya and homebridge-tuya-plus build", () => {
    expect(
      encodeDiscoveryRequest(DISCOVERY_REQUEST_IP, DISCOVERY_REQUEST_IV),
    ).toEqual(DISCOVERY_REQUEST);
  });
});
