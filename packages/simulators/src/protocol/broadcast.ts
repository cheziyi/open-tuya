import { createHash } from "node:crypto";
import type { ProtocolVersion } from "@open-tuya/core";
import { openClientFrame, sealDeviceFrame } from "./frames.js";

// Source: A device encrypts its broadcast under the MD5 of "yGAdlopoPVldABfn",
// in https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db
// and https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
const BROADCAST_KEY = createHash("md5").update("yGAdlopoPVldABfn").digest();
const UDP = 0x00;
const UDP_NEW = 0x13;
const BOARDCAST_LPV34 = 0x23;
const REQ_DEVINFO = 0x25;

export interface BroadcastFields {
  ip: string;
  gwId: string;
  uuid: string;
  productKey: string;
}

// Source: A 3.3 and a 3.4 device broadcast a 0x55AA frame with a CRC32,
// return code 0 and sequence number 0, the 3.3 one with command 0x13 and the
// 3.4 one with command 0x23, and a 3.5 device a 0x6699 frame with command
// 0x13, captured in
// https://github.com/xZetsubou/hass-localtuya/commit/aeb5f9ce4c07c57e7868f296978fed4a2a5e9f18.
// Source: A 3.1 device broadcasts a 0x55AA frame with command 0, return code
// 0 and sequence number 0, its JSON in plain text, captured in
// https://github.com/codetheweb/tuyapi/issues/17#issuecomment-361135781.
/** Builds a broadcast as a device of `version` sends it. `iv` is used on 3.5
 * alone. It throws a `TypeError` on 3.2, as no source shows a 3.2 device's
 * broadcast. */
export function sealBroadcast(
  version: ProtocolVersion,
  fields: BroadcastFields,
  iv: Uint8Array,
): Buffer {
  if (version === "3.2") {
    throw new TypeError("No source shows a 3.2 device's broadcast");
  }
  return sealDeviceFrame(
    version === "3.1" || version === "3.5" ? version : "3.3",
    {
      sequenceNumber: 0,
      command:
        version === "3.1" ? UDP : version === "3.4" ? BOARDCAST_LPV34 : UDP_NEW,
      returnCode: 0,
      plaintext: Buffer.from(broadcastJson(version, fields)),
    },
    BROADCAST_KEY,
    iv,
  );
}

// Source: The fields, in this order, captured from a 3.3, a 3.4 and a 3.5
// device in
// https://github.com/xZetsubou/hass-localtuya/commit/aeb5f9ce4c07c57e7868f296978fed4a2a5e9f18,
// and from a 3.1 device in
// https://github.com/codetheweb/tuyapi/issues/17#issuecomment-361135781.
function broadcastJson(
  version: Exclude<ProtocolVersion, "3.2">,
  fields: BroadcastFields,
): string {
  const { ip, gwId, uuid, productKey } = fields;
  const common = { active: 2, ablilty: 0, encrypt: true, productKey, version };
  switch (version) {
    case "3.1":
      return JSON.stringify({
        ip,
        gwId,
        active: 2,
        ability: 0,
        mode: 0,
        encrypt: true,
        productKey,
        version,
      });
    case "3.3":
      return JSON.stringify({ ip, gwId, ...common });
    case "3.4":
      return JSON.stringify({ ip, gwId, ...common, token: true, wf_cfg: true });
    case "3.5":
      return JSON.stringify({
        ip,
        gwId,
        uuid,
        ...common,
        token: true,
        wf_cfg: true,
        clientLink: 1,
      });
  }
}

// Source: A device takes a 0x6699 frame with command 0x25 under the broadcast
// key, whose plaintext is JSON with no return code, and answers only when it
// holds both "ip" and "from", in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
/** Reads a client's request for devices to answer, and returns the address
 * it asks them to answer to, or `undefined` for any other datagram. */
export function openDiscoveryRequest(datagram: Buffer): string | undefined {
  let payload: Buffer;
  try {
    const opened = openClientFrame("3.5", datagram, BROADCAST_KEY);
    if (!opened || opened.frame.command !== REQ_DEVINFO) {
      return undefined;
    }
    payload = opened.frame.payload;
  } catch {
    return undefined;
  }
  let request: unknown;
  try {
    request = JSON.parse(payload.toString());
  } catch {
    return undefined;
  }
  if (typeof request !== "object" || request === null) {
    return undefined;
  }
  const { ip, from } = request as Record<string, unknown>;
  return typeof ip === "string" && from !== undefined ? ip : undefined;
}
