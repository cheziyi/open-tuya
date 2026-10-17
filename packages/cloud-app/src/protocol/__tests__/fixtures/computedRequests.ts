// No source captures a signed request whole: a log shows the response, never
// the request ID and the refresh token that sign it. Each value here was
// computed from the inputs below by tuya-device-sharing-sdk's own
// CustomerApi, at
// https://github.com/tuya/tuya-device-sharing-sdk/commit/170cfd9ee7aefb48c14e27d9ee4a45c6bc6b15c4,
// with its HTTP session stubbed to record what it sends, and its request ID,
// clock and nonces fixed.

export const CLIENT_ID = "HA_3y9q4ak7g4ephrvke";
export const ACCESS_TOKEN = "ACCESSTOKEN";
export const REFRESH_TOKEN = "REFRESHTOKEN";
export const TIME_IN_MS = 1_700_000_000_000;

// GET /v1.0/m/life/ha/devices/detail with {"devIds":"bf0123456789abcdefgh"}
// as its query, under nonce "ABCDEFGHJKMN".
export const GET_REQUEST = {
  requestId: "00000000-0000-4000-8000-000000000001",
  query: { devIds: "bf0123456789abcdefgh" },
  nonce: "ABCDEFGHJKMN",
  encdata:
    "QUJDREVGR0hKS01ON+C4VBiQysnPoQSH7pPoklJ13hUBF91t8M5eXp4i8AtEYEjYMK2gu994cqqwxcxU3w==",
  sign: "9c133bff5ff7b27cb58f0cb82618fbff7bdac217892615a45bae740e0476abd9",
  // The result the SDK decrypts with this request's key, encrypted by its
  // own code under nonce "nonce0123456".
  responseResult:
    "bm9uY2UwMTIzNDU2Ce8SvgcCwv6m0YUwF1p9BzHolSd1KF1DQPNtoBd0I8D+PSAZdvzGZpyVPGZ0s5hsVIcGhbu3X2OKcr3VIXZy582OkxKdjHAyUSVszcc/ynYr2jGBOhZ2GLZUMA==",
  decryptedResult:
    '[{"id":"bf0123456789abcdefgh","status":[{"code":"switch_1","value":true}]}]',
};

// POST /v1.1/m/thing/bf0123456789abcdefgh/commands with
// {"commands":[{"code":"switch_1","value":false}]} as its body, under nonce
// "PQRSTWXYZabc".
export const POST_REQUEST = {
  requestId: "00000000-0000-4000-8000-000000000002",
  body: { commands: [{ code: "switch_1", value: false }] },
  nonce: "PQRSTWXYZabc",
  encdata:
    "UFFSU1RXWFlaYWJjDYLPsT7SCMs33wqTi9Pq4zlJI7JWAUXrf/TPOUzoT9hgjRNylwZ9RJKyatFO51f4DqfnBXFeBLe7dhivAIf4fw==",
  sign: "9bb97385feb5a3ca945b1bfde3390528c5bf31544bdda9c0587c710f8b860c72",
};

// GET /v1.0/m/life/users/homes, with no query and no body.
export const BARE_REQUEST = {
  requestId: "00000000-0000-4000-8000-000000000003",
  sign: "ef383cbe89840de728b45537040e8541ec3c6807b4e33a35fd446cdfaa9af958",
};
