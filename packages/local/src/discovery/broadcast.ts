import { createHash } from "node:crypto";
import { PROTOCOL_VERSIONS, type ProtocolVersion } from "@open-tuya/core";
import { decryptAesEcb } from "../protocol/aesEcb.js";
import { COMMANDS } from "../protocol/commands.js";
import { decodeFrames } from "../protocol/frame.js";
import { decodeV35Frames } from "../protocol/v35Frame.js";

// Source: A broadcast is encrypted under the MD5 of "yGAdlopoPVldABfn" on 3.3,
// in https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db,
// and on 3.5, in
// https://github.com/jasonacox/tinytuya/commit/a495c694990c386004f7780217afaa6832d45fa0
// and https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
export const BROADCAST_KEY = createHash("md5")
  .update("yGAdlopoPVldABfn")
  .digest();

const PREFIX_6699 = 0x00006699;

/** A device as its broadcast describes it. `host`, `deviceId` and `version`
 * are what `createLocalTuyaClient` takes. */
export interface DiscoveredTuyaDevice {
  /** The IP address the device reports for itself. */
  host: string;
  /** The ID Tuya calls `gwId`. */
  deviceId: string;
  version: ProtocolVersion;
  productKey: string;
}

// Source: A 3.3 device broadcasts a 0x55AA frame with command UDP_NEW, return
// code 0, its JSON encrypted with AES-ECB and a CRC32, and a 3.4 device the
// same frame with command BOARDCAST_LPV34, both captured in
// https://github.com/xZetsubou/hass-localtuya/commit/aeb5f9ce4c07c57e7868f296978fed4a2a5e9f18.
// A 3.4 broadcast carries a CRC32 where its TCP frames carry an HMAC, in
// https://github.com/codetheweb/tuyapi/commit/45e0ae8cb3064a89edf57255f42efcc9fc338769.
// Source: A 3.1 device broadcasts a 0x55AA frame with command UDP and return
// code 0, its JSON in plain text, captured in
// https://github.com/codetheweb/tuyapi/issues/17#issuecomment-361135781.
// Source: A 3.5 device broadcasts, and answers a REQ_DEVINFO with, a 0x6699
// frame with command UDP_NEW and return code 0 in front of its JSON, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
// Source: The JSON carries ip, gwId, productKey and version, in every capture
// above.
/** Reads a datagram a device sent: a broadcast, or a 3.5 device's answer to a
 * request. It returns `undefined` for any other datagram: one that is not a
 * whole frame, whose CRC or tag is wrong, that a client sent, or from a device
 * of a version this package does not speak. */
export function decodeBroadcast(
  datagram: Uint8Array,
): DiscoveredTuyaDevice | undefined {
  const bytes = Buffer.from(
    datagram.buffer,
    datagram.byteOffset,
    datagram.byteLength,
  );
  let payload: Uint8Array;
  try {
    if (bytes.length >= 4 && bytes.readUInt32BE(0) === PREFIX_6699) {
      const frame = decodeV35Frames(bytes, BROADCAST_KEY).frames[0];
      if (!frame || !isBroadcastCommand(frame.command)) {
        return undefined;
      }
      payload = frame.payload;
    } else {
      const frame = decodeFrames(bytes).frames[0];
      if (!frame || !isBroadcastCommand(frame.command)) {
        return undefined;
      }
      payload =
        frame.command === COMMANDS.UDP
          ? frame.payload
          : decryptAesEcb(frame.payload, BROADCAST_KEY);
    }
  } catch {
    return undefined;
  }
  return parseDevice(payload);
}

// Source: A device broadcasts with UDP, UDP_NEW or BOARDCAST_LPV34 alone, in
// https://github.com/codetheweb/tuyapi/commit/45e0ae8cb3064a89edf57255f42efcc9fc338769.
// A client's REQ_DEVINFO arrives on the same port as a device's answer,
// sealed under the same key, and is left out here.
function isBroadcastCommand(command: number): boolean {
  return (
    command === COMMANDS.UDP ||
    command === COMMANDS.UDP_NEW ||
    command === COMMANDS.BOARDCAST_LPV34
  );
}

function parseDevice(payload: Uint8Array): DiscoveredTuyaDevice | undefined {
  let message: unknown;
  try {
    message = JSON.parse(Buffer.from(payload).toString());
  } catch {
    return undefined;
  }
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const { ip, gwId, productKey, version } = message as Record<string, unknown>;
  if (
    typeof ip !== "string" ||
    typeof gwId !== "string" ||
    typeof productKey !== "string" ||
    !isProtocolVersion(version)
  ) {
    return undefined;
  }
  return { host: ip, deviceId: gwId, version, productKey };
}

function isProtocolVersion(value: unknown): value is ProtocolVersion {
  return PROTOCOL_VERSIONS.includes(value as ProtocolVersion);
}
