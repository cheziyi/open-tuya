import { COMMANDS } from "../protocol/commands.js";
import { encodeV35Frame } from "../protocol/v35Frame.js";
import { BROADCAST_KEY } from "./broadcast.js";

// Source: A 3.5 device takes a REQ_DEVINFO on UDP port 7000: a 0x6699 frame
// under the broadcast key whose plaintext is JSON with "ip" and "from", and no
// return code. It answers to that ip, on port 7000, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
// Source: A client sends it with sequence number 0 and {"from":"app","ip":…},
// in https://github.com/jasonacox/tinytuya/commit/831f1131f17e6110c814c7d912e44a192fddb002
// and https://github.com/adrianjagielak/homebridge-tuya-plus/commit/b3cb091641238dc00b9b62b7d16795ffeb9acdef.
/** Builds the request that asks each 3.5 device in reach to answer with its
 * broadcast, sent to `ip`. `ip` is the address of the sender's interface the
 * request leaves by: see DESIGN.md#discovery. `iv` is the 12 bytes GCM
 * takes, which must differ for every request. */
export function encodeDiscoveryRequest(ip: string, iv: Uint8Array): Buffer {
  return encodeV35Frame(
    {
      sequenceNumber: 0,
      command: COMMANDS.REQ_DEVINFO,
      payload: Buffer.from(JSON.stringify({ from: "app", ip })),
    },
    BROADCAST_KEY,
    iv,
  );
}
