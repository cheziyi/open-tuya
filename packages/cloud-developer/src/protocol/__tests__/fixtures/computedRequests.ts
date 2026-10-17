// Each signature here was computed from the inputs below, with the clock
// fixed, by tinytuya's own Cloud class at
// https://github.com/jasonacox/tinytuya/commit/3c0a687d442dc68e13eeafad39062526b20c109a
// and by tuya-iot-python-sdk's own TuyaOpenAPI at
// https://github.com/tuya/tuya-iot-python-sdk/commit/20a7c92898fdd44e559667bbf8f2bf6fdb1e9185,
// which agree; the POST comes from the SDK alone, as tinytuya also signs a
// Content-type header. The same formula reproduces nine signatures captured
// with their secrets in https://github.com/jasonacox/tinytuya/issues/330,
// https://github.com/jasonacox/tinytuya/issues/346 and
// https://github.com/tuya/tuya-home-assistant/issues/55, whose secrets stay
// out of this repository.

export const CLIENT_ID = "abcdefghij0123456789";
export const SECRET = "0123456789abcdef0123456789abcdef";
export const ACCESS_TOKEN = "ACCESSTOKEN";
export const TIME_IN_MS = 1_700_000_000_000;

// GET /v1.0/token?grant_type=1, signed without a token.
export const TOKEN_SIGN =
  "2AA16BA30469799719FEF38351F089B0987E6CCF7786D191955897211ACF2003";

// GET /v1.0/devices/bf0123456789abcdefgh.
export const DEVICE_SIGN =
  "78F73FF4C63C0501E6932DB92756E56C39CA23A5C62E9D1947A9632A7E98352F";

// GET /v1.3/iot-03/devices with page_size 75, source_type tuyaUser and
// source_id UID, signed with its keys sorted.
export const QUERY_SIGN =
  "5413946844E7D8E7ED9A810D2A7B9439560B0FC450449011F767E03D62381D63";

// POST /v1.0/iot-03/devices/bf0123456789abcdefgh/commands with this body, as
// Python's json.dumps writes it: the cloud hashes the bytes it receives.
export const COMMANDS_BODY =
  '{"commands": [{"code": "switch_1", "value": true}]}';
export const COMMANDS_SIGN =
  "618DD9A0126A066A75F7A5619DFF4D37FF95432BD277EBC3263A88C323698332";
