// Source: Captured in
// https://github.com/home-assistant/core/issues/178266#issuecomment-5200735391.
export const SIGN_INVALID = {
  code: "-9999999",
  msg: "sign invalid",
  t: 1785993858405,
  tid: "12837f8b915711f186da224e4460dc0a",
  success: false,
};

// Source: Captured in
// https://github.com/home-assistant/core/issues/178266#issuecomment-5200735391.
export const RATE_LIMITED = {
  code: "-9999999",
  msg: "API_QPS_LIMIT_OR_DEGRADE",
  t: 1785993858347,
  tid: "127bb49c915711f1a93572667d021613",
  success: false,
};

// Source: Captured in
// https://github.com/tuya/tuya-device-sharing-sdk/issues/77, with a number
// for its code.
export const URI_PATH_INVALID = {
  code: 1108,
  msg: "uri path invalid",
  success: false,
};

// Source: Captured in
// https://github.com/azerty9971/xtend_tuya/issues/38#issuecomment-2249788629.
export const COMMAND_NOT_SUPPORTED = {
  code: "2008",
  msg: "command or value not support",
  t: 1721896589137,
  success: false,
};

// Source: The MQTT credentials and topics, captured in
// https://github.com/home-assistant-libs/tuya-device-handlers/issues/472#issuecomment-5546380301,
// with the client ID, username and password redacted.
export const PUSH_CONFIG = {
  clientId: "cloud_00000000000000000000000000000000",
  expireTime: 7200,
  password: "00000000000000000000000000000000",
  topic: {
    devId: {
      pub: "cloud/device/{devId}/out",
      sub: "cloud/device/{devId}/in/24d2afb98121974b6505c40a3a980362",
    },
    ownerId: { sub: "cloud/group/{ownerId}/in" },
  },
  url: "ssl://m1.tuyaus.com:8883",
  username: "cloud_00000000000000000000000000000000",
};

// Source: A pushed report, captured in
// https://github.com/tuya/tuya-device-sharing-sdk/issues/65.
export const PUSH_TOPIC =
  "cloud/device/bfde57db0971635fb4vsop/in/24d2afb98121974b6505c40a3a980362/pen";
export const PUSHED_REPORT =
  '{"protocol":4,"data":{"devId":"bfde57db0971635fb4vsop","dataId":"afdf169a-4066-490e-84fb-b37d0309ba1c","productKey":"gpzittzfnzhduquz","status":[{"dpId":103,"t":1777624144986,"value":6}]},"t":1777624145399}';
