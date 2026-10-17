// Source: CONTROL, STATUS, HEART_BEAT, DP_QUERY, CONTROL_NEW, DP_QUERY_NEW and
// UDP_NEW are numbered in
// https://github.com/codetheweb/tuyapi/commit/a0c412245dfe8aed089d20d4f512aef2348af8da,
// UPDATEDPS in
// https://github.com/codetheweb/tuyapi/commit/4be9cc5de3048ab0f5eb97674ca964112d1d9452,
// SESS_KEY_NEG_START, SESS_KEY_NEG_RESP, SESS_KEY_NEG_FINISH and
// BOARDCAST_LPV34 in
// https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e,
// and REQ_DEVINFO in
// https://github.com/jasonacox/tinytuya/commit/831f1131f17e6110c814c7d912e44a192fddb002.
export const COMMANDS = {
  SESS_KEY_NEG_START: 0x03,
  SESS_KEY_NEG_RESP: 0x04,
  SESS_KEY_NEG_FINISH: 0x05,
  CONTROL: 0x07,
  STATUS: 0x08,
  HEART_BEAT: 0x09,
  DP_QUERY: 0x0a,
  CONTROL_NEW: 0x0d,
  DP_QUERY_NEW: 0x10,
  UPDATEDPS: 0x12,
  UDP_NEW: 0x13,
  BOARDCAST_LPV34: 0x23,
  REQ_DEVINFO: 0x25,
} as const;
