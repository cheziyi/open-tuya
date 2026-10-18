export const PROTOCOL_VERSIONS = ["3.1", "3.3", "3.4", "3.5"] as const;

export type ProtocolVersion = (typeof PROTOCOL_VERSIONS)[number];
