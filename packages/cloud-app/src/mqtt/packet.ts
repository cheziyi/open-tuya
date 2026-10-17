export const PACKET_TYPES = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  SUBSCRIBE: 8,
  UNSUBSCRIBE: 10,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
} as const;

const PROTOCOL_LEVEL_V311 = 4;
const USERNAME_FLAG = 0x80;
const PASSWORD_FLAG = 0x40;
const CLEAN_SESSION_FLAG = 0x02;
// SUBSCRIBE and UNSUBSCRIBE carry 0b0010 in their fixed header's low bits.
const RESERVED_FLAGS = 0x02;
const MAX_REMAINING_LENGTH_BYTES = 4;

export interface MqttPacket {
  type: number;
  /** The low 4 bits of the fixed header. */
  flags: number;
  body: Buffer;
}

export interface DecodedPackets {
  packets: MqttPacket[];
  /** The bytes of a packet not yet whole. */
  remainder: Buffer;
}

export interface ConnectFields {
  clientId: string;
  username: string;
  password: string;
  keepAliveInSeconds: number;
}

/** A CONNECT with a clean session, a username and a password, and no will. */
export function encodeConnect(fields: ConnectFields): Buffer {
  const keepAlive = Buffer.alloc(2);
  keepAlive.writeUInt16BE(fields.keepAliveInSeconds);
  return encodePacket(
    PACKET_TYPES.CONNECT,
    0,
    Buffer.concat([
      encodeString("MQTT"),
      Buffer.from([
        PROTOCOL_LEVEL_V311,
        USERNAME_FLAG | PASSWORD_FLAG | CLEAN_SESSION_FLAG,
      ]),
      keepAlive,
      encodeString(fields.clientId),
      encodeString(fields.username),
      encodeString(fields.password),
    ]),
  );
}

/** A SUBSCRIBE to `topic` at QoS 0. */
export function encodeSubscribe(packetId: number, topic: string): Buffer {
  return encodePacket(
    PACKET_TYPES.SUBSCRIBE,
    RESERVED_FLAGS,
    Buffer.concat([
      encodePacketId(packetId),
      encodeString(topic),
      Buffer.of(0),
    ]),
  );
}

export function encodeUnsubscribe(packetId: number, topic: string): Buffer {
  return encodePacket(
    PACKET_TYPES.UNSUBSCRIBE,
    RESERVED_FLAGS,
    Buffer.concat([encodePacketId(packetId), encodeString(topic)]),
  );
}

export function encodePingRequest(): Buffer {
  return encodePacket(PACKET_TYPES.PINGREQ, 0, Buffer.alloc(0));
}

export function encodeDisconnect(): Buffer {
  return encodePacket(PACKET_TYPES.DISCONNECT, 0, Buffer.alloc(0));
}

/** Splits `bytes` into whole packets. It throws a `RangeError` when a
 * remaining length runs past 4 bytes, as the stream has lost its place. */
export function decodePackets(bytes: Buffer): DecodedPackets {
  const packets: MqttPacket[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const header = bytes[offset] as number;
    const length = decodeRemainingLength(bytes, offset + 1);
    if (!length) {
      break;
    }
    const start = offset + 1 + length.bytes;
    const end = start + length.value;
    if (end > bytes.length) {
      break;
    }
    packets.push({
      type: header >> 4,
      flags: header & 0x0f,
      body: bytes.subarray(start, end),
    });
    offset = end;
  }
  return { packets, remainder: bytes.subarray(offset) };
}

/** The return code of a CONNACK's body: 0 when the server accepted the
 * connection. */
export function parseConnack(body: Buffer): number {
  return body[1] ?? -1;
}

export interface PublishedMessage {
  topic: string;
  payload: Buffer;
}

export function parsePublish(flags: number, body: Buffer): PublishedMessage {
  const topicLength = body.readUInt16BE(0);
  const qos = (flags >> 1) & 0x03;
  const payloadStart = 2 + topicLength + (qos > 0 ? 2 : 0);
  return {
    topic: body.subarray(2, 2 + topicLength).toString(),
    payload: body.subarray(payloadStart),
  };
}

function encodePacket(type: number, flags: number, body: Buffer): Buffer {
  return Buffer.concat([
    Buffer.of((type << 4) | flags),
    encodeRemainingLength(body.length),
    body,
  ]);
}

function encodeRemainingLength(length: number): Buffer {
  const bytes: number[] = [];
  let rest = length;
  do {
    const byte = rest % 128;
    rest = Math.floor(rest / 128);
    bytes.push(rest > 0 ? byte | 0x80 : byte);
  } while (rest > 0);
  return Buffer.from(bytes);
}

function decodeRemainingLength(
  bytes: Buffer,
  offset: number,
): { value: number; bytes: number } | undefined {
  let value = 0;
  for (let index = 0; index < MAX_REMAINING_LENGTH_BYTES; index++) {
    const byte = bytes[offset + index];
    if (byte === undefined) {
      return undefined;
    }
    value += (byte & 0x7f) * 128 ** index;
    if ((byte & 0x80) === 0) {
      return { value, bytes: index + 1 };
    }
  }
  throw new RangeError("An MQTT remaining length runs past 4 bytes");
}

function encodeString(text: string): Buffer {
  const bytes = Buffer.from(text);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function encodePacketId(packetId: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(packetId);
  return bytes;
}
