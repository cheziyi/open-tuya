import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { crc32 } from "node:zlib";
import type { ProtocolVersion } from "@open-tuya/core";

// Source: The 0x55AA frame: prefix, sequence number, command and a length
// field counting what follows it, then the payload, a CRC32 of every byte
// before it and the 0xAA55 suffix, in
// https://github.com/codetheweb/tuyapi/commit/9ea40d76dbc8721a174b427edf738d8f2f338c60.
// Source: 3.4 puts an HMAC-SHA256 under the key where the CRC was, in
// https://github.com/jasonacox/tinytuya/commit/782b469ee4c38b01703410fcc8f745bb53489c0e.
// Source: The 0x6699 frame: prefix, two zero bytes, sequence number, command
// and a length field counting the IV, the ciphertext and the tag, then
// AES-128-GCM with the 14 bytes after the prefix as additional data, and the
// 0x9966 suffix, in
// https://github.com/jasonacox/tinytuya/commit/5742dcb99ef3c17d86b31470ed98b1acaed4e739.
// Source: A device puts a 4-byte return code ahead of its payload: in the
// clear on 0x55AA frames, in
// https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674,
// and inside the plaintext on 0x6699 frames, little-endian, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
// Source: On 3.1, a client seals CONTROL and a device seals STATUS as "3.1",
// 16 hex digits of the MD5 of "data=" + base64 + "||lpv=3.1||" + key from
// the 8th, and the base64 of the AES-128-ECB ciphertext; everything else
// goes as plain text, captured in
// https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247544765.
// Source: The version header, the version and 12 more bytes, goes ahead of
// the ciphertext on 3.3, in
// https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db,
// and inside the encrypted bytes on 3.4 and 3.5, in
// https://github.com/jasonacox/tinytuya/commit/a60ffc61484b164f588e2e6685810cfbd262de8f.

const PREFIX_55AA = Buffer.from([0x00, 0x00, 0x55, 0xaa]);
const SUFFIX_55AA = Buffer.from([0x00, 0x00, 0xaa, 0x55]);
const PREFIX_6699 = Buffer.from([0x00, 0x00, 0x66, 0x99]);
const SUFFIX_6699 = Buffer.from([0x00, 0x00, 0x99, 0x66]);
const VERSION_HEADER_LENGTH = 15;
const GCM_TAG_LENGTH = 16;
const GCM_IV_LENGTH = 12;
const V31_PREFIX = Buffer.from("3.1");
const V31_SIGNATURE_LENGTH = 16;
// Source: 8 is STATUS, in
// https://github.com/codetheweb/tuyapi/commit/a0c412245dfe8aed089d20d4f512aef2348af8da.
const STATUS = 0x08;

/** The two numbers after the version in a version header: the sender's
 * serial number and its source ID. */
export interface VersionHeaderFields {
  serialNumber: number;
  sourceId: number;
}

export interface ClientFrame {
  sequenceNumber: number;
  command: number;
  /** Decrypted, with the version header removed. */
  payload: Buffer;
  /** What the version header held, when the payload had one. */
  versionHeader?: VersionHeaderFields;
}

export interface DeviceFrame {
  sequenceNumber: number;
  command: number;
  returnCode: number;
  plaintext: Uint8Array;
  /** The version header to put in front of the plaintext, if any. */
  versionHeader?: VersionHeaderFields;
}

/** Builds a frame as a device of `version` sends it. `iv` is used on 3.5
 * alone. */
export function sealDeviceFrame(
  version: ProtocolVersion,
  frame: DeviceFrame,
  key: Uint8Array,
  iv: Uint8Array,
): Buffer {
  const returnCode =
    version === "3.5"
      ? uint32LittleEndian(frame.returnCode)
      : uint32(frame.returnCode);
  const header = frame.versionHeader
    ? versionHeader(version, frame.versionHeader)
    : Buffer.alloc(0);
  if (version === "3.5") {
    const head = Buffer.concat([
      PREFIX_6699,
      Buffer.alloc(2),
      uint32(frame.sequenceNumber),
      uint32(frame.command),
      uint32(
        GCM_IV_LENGTH +
          4 +
          header.length +
          frame.plaintext.length +
          GCM_TAG_LENGTH,
      ),
    ]);
    const cipher = createCipheriv("aes-128-gcm", key, iv);
    cipher.setAAD(head.subarray(PREFIX_6699.length));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.concat([returnCode, header, frame.plaintext])),
      cipher.final(),
    ]);
    return Buffer.concat([
      head,
      iv,
      ciphertext,
      cipher.getAuthTag(),
      SUFFIX_6699,
    ]);
  }
  let body: Buffer;
  if (version === "3.1") {
    body =
      frame.command === STATUS
        ? sealV31(key, frame.plaintext)
        : Buffer.from(frame.plaintext);
  } else if (version === "3.3") {
    body = Buffer.concat([header, ecb(key, frame.plaintext)]);
  } else {
    body = ecb(key, Buffer.concat([header, frame.plaintext]));
  }
  const checkLength = checkLengthOf(version);
  const signed = Buffer.concat([
    PREFIX_55AA,
    uint32(frame.sequenceNumber),
    uint32(frame.command),
    uint32(returnCode.length + body.length + checkLength + SUFFIX_55AA.length),
    returnCode,
    body,
  ]);
  return Buffer.concat([signed, check(version, key, signed), SUFFIX_55AA]);
}

/** Reads the first frame in `bytes`, as a client of `version` sends it, and
 * returns it with the bytes after it, or `undefined` while it is not yet
 * whole. It throws on a frame whose CRC, HMAC or tag is wrong, or that does
 * not decrypt. */
export function openClientFrame(
  version: ProtocolVersion,
  bytes: Buffer,
  key: Uint8Array,
): { frame: ClientFrame; rest: Buffer } | undefined {
  const opened =
    version === "3.5" ? open6699(bytes, key) : open55aa(version, bytes, key);
  return opened && { frame: opened.frame, rest: bytes.subarray(opened.length) };
}

function open55aa(
  version: "3.1" | "3.3" | "3.4",
  bytes: Buffer,
  key: Uint8Array,
): { frame: ClientFrame; length: number } | undefined {
  if (bytes.length < 16) {
    return undefined;
  }
  if (!bytes.subarray(0, 4).equals(PREFIX_55AA)) {
    throw new Error("A client frame does not start with 0x000055AA");
  }
  const length = 16 + bytes.readUInt32BE(12);
  if (bytes.length < length) {
    return undefined;
  }
  const checkLength = checkLengthOf(version);
  const checkOffset = length - SUFFIX_55AA.length - checkLength;
  const signed = bytes.subarray(0, checkOffset);
  if (
    !timingSafeEqual(
      check(version, key, signed),
      bytes.subarray(checkOffset, checkOffset + checkLength),
    )
  ) {
    throw new Error("A client frame's CRC or HMAC is wrong");
  }
  const body = signed.subarray(16);
  let opened: OpenedPayload;
  if (version === "3.1") {
    opened = { payload: openV31(key, body) };
  } else if (version === "3.3") {
    opened = splitVersionHeader(version, body);
    opened.payload = decryptEcb(key, opened.payload);
  } else {
    opened = splitVersionHeader(version, decryptEcb(key, body));
  }
  return {
    frame: {
      sequenceNumber: bytes.readUInt32BE(4),
      command: bytes.readUInt32BE(8),
      ...opened,
    },
    length,
  };
}

function open6699(
  bytes: Buffer,
  key: Uint8Array,
): { frame: ClientFrame; length: number } | undefined {
  if (bytes.length < 18) {
    return undefined;
  }
  if (!bytes.subarray(0, 4).equals(PREFIX_6699)) {
    throw new Error("A client frame does not start with 0x00006699");
  }
  const length = 18 + bytes.readUInt32BE(14) + SUFFIX_6699.length;
  if (bytes.length < length) {
    return undefined;
  }
  const ivEnd = 18 + GCM_IV_LENGTH;
  const tagStart = length - SUFFIX_6699.length - GCM_TAG_LENGTH;
  const decipher = createDecipheriv(
    "aes-128-gcm",
    key,
    bytes.subarray(18, ivEnd),
  );
  decipher.setAAD(bytes.subarray(4, 18));
  decipher.setAuthTag(bytes.subarray(tagStart, tagStart + GCM_TAG_LENGTH));
  const plaintext = Buffer.concat([
    decipher.update(bytes.subarray(ivEnd, tagStart)),
    decipher.final(),
  ]);
  return {
    frame: {
      sequenceNumber: bytes.readUInt32BE(6),
      command: bytes.readUInt32BE(10),
      ...splitVersionHeader("3.5", plaintext),
    },
    length,
  };
}

function check(
  version: ProtocolVersion,
  key: Uint8Array,
  signed: Buffer,
): Buffer {
  return version === "3.1" || version === "3.3"
    ? uint32(crc32(signed))
    : createHmac("sha256", key).update(signed).digest();
}

function checkLengthOf(version: ProtocolVersion): number {
  return version === "3.1" || version === "3.3" ? 4 : 32;
}

function sealV31(key: Uint8Array, plaintext: Uint8Array): Buffer {
  const data = ecb(key, plaintext).toString("base64");
  return Buffer.concat([
    V31_PREFIX,
    Buffer.from(signV31(key, data)),
    Buffer.from(data),
  ]);
}

function openV31(key: Uint8Array, body: Buffer): Buffer {
  if (!body.subarray(0, V31_PREFIX.length).equals(V31_PREFIX)) {
    return body;
  }
  const start = V31_PREFIX.length + V31_SIGNATURE_LENGTH;
  const data = body.subarray(start).toString();
  if (
    body.subarray(V31_PREFIX.length, start).toString() !== signV31(key, data)
  ) {
    throw new Error("A client payload's signature is wrong");
  }
  return decryptEcb(key, Buffer.from(data, "base64"));
}

function signV31(key: Uint8Array, data: string): string {
  return createHash("md5")
    .update(Buffer.concat([Buffer.from(`data=${data}||lpv=3.1||`), key]))
    .digest("hex")
    .substring(8, 24);
}

function ecb(key: Uint8Array, plaintext: Uint8Array): Buffer {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function decryptEcb(key: Uint8Array, ciphertext: Buffer): Buffer {
  if (ciphertext.length === 0) {
    return ciphertext;
  }
  const decipher = createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Source: A sender puts a zero CRC, its serial number and its source ID after
// the version, and a device writes source ID 1, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
function versionHeader(
  version: ProtocolVersion,
  fields: VersionHeaderFields,
): Buffer {
  const header = Buffer.alloc(VERSION_HEADER_LENGTH);
  header.write(version);
  header.writeUInt32BE(fields.serialNumber, VERSION_HEADER_LENGTH - 8);
  header.writeUInt32BE(fields.sourceId, VERSION_HEADER_LENGTH - 4);
  return header;
}

interface OpenedPayload {
  payload: Buffer;
  versionHeader?: VersionHeaderFields;
}

function splitVersionHeader(
  version: ProtocolVersion,
  bytes: Buffer,
): OpenedPayload {
  if (bytes.subarray(0, version.length).toString("latin1") !== version) {
    return { payload: bytes };
  }
  return {
    payload: bytes.subarray(VERSION_HEADER_LENGTH),
    versionHeader: {
      serialNumber: bytes.readUInt32BE(VERSION_HEADER_LENGTH - 8),
      sourceId: bytes.readUInt32BE(VERSION_HEADER_LENGTH - 4),
    },
  };
}

function uint32LittleEndian(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}
