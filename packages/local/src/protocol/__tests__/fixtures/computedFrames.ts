// No source's tests capture a 3.4 frame or a session key negotiation. Each
// value here was computed from the inputs below by tinytuya's own code at
// https://github.com/jasonacox/tinytuya/commit/3c0a687d442dc68e13eeafad39062526b20c109a,
// and each frame by tuyapi's as well, at
// https://github.com/codetheweb/tuyapi/commit/4135c835deaa7c94ad0df9dd4c34878cb5eb2916,
// which gave the same bytes.

export const LOCAL_KEY = Buffer.from("0123456789abcdef");
export const LOCAL_NONCE = Buffer.from("0123456789abcdef");
export const REMOTE_NONCE = Buffer.from("fedcba9876543210");

// SESS_KEY_NEG_START, sequence number 1, carrying LOCAL_NONCE under LOCAL_KEY.
export const V34_SESSION_KEY_START = Buffer.from(
  "000055aa00000001000000030000004472727e881edcfd0100a718687909b565377222e0" +
    "61a924c591cd9c27ea163ed4d7dd1f9eb60b8cb5b90748aa228534c62460d05b84665c9e" +
    "692efc896dd77d680000aa55",
  "hex",
);

export const V34_CONTROL_NEW_PLAINTEXT =
  '{"protocol":5,"t":1700000000,"data":{"dps":{"1":true}}}';

// CONTROL_NEW, sequence number 3, carrying V34_CONTROL_NEW_PLAINTEXT under
// LOCAL_KEY.
export const V34_CONTROL_NEW = Buffer.from(
  "000055aa000000030000000d000000744490b05d74be9368c24a038cbaeded8e89ea503e" +
    "4be494dfe0c010bc6c463c75723ef6aca177a39b03b3e4fb00012c19edd249953145abb3" +
    "cfa65e18d98cc3bde3d0951b8ab2e031cb512d241494e999fbc2d2b631be8f979504cb5d" +
    "0eb35993f94114a711e957cab7eda76d8ebd84d50000aa55",
  "hex",
);

export const V34_STATUS_PLAINTEXT = '{"dps":{"1":true},"t":1700000000}';

// A STATUS frame as a device sends it, sequence number 7, return code 0,
// carrying V34_STATUS_PLAINTEXT under LOCAL_KEY. tinytuya built it and tuyapi
// read it back.
export const V34_STATUS = Buffer.from(
  "000055aa000000070000000800000068000000004490b05d74be9368c24a038cbaeded8e" +
    "41fb8ef70a70a27b93a7e74ffe754263dc16c12f0a2eea736800b405bea098bb377222e0" +
    "61a924c591cd9c27ea163ed40c263ea28fa08b4d5adc56b0db30794302d98f4d26a0691a" +
    "3aac69037e71d6980000aa55",
  "hex",
);

// REMOTE_NONCE, then the HMAC-SHA256 of LOCAL_NONCE under LOCAL_KEY.
export const SESSION_KEY_RESPONSE = Buffer.from(
  "66656463626139383736353433323130fb5b26229c20b7ed866706a2fbfae67e3f404bb6" +
    "abe77ff45063a459a42924a4",
  "hex",
);

// The HMAC-SHA256 of REMOTE_NONCE under LOCAL_KEY.
export const SESSION_KEY_FINISH = Buffer.from(
  "0de373b876d33f8102b2a67aa43aaa88161b7606292f33f47db3b67fd5e2bf4e",
  "hex",
);

export const V34_SESSION_KEY = Buffer.from(
  "6575cf6b37479d9215337ff9767fe786",
  "hex",
);
export const V35_SESSION_KEY = Buffer.from(
  "34165bab783422860c0c23b2d48cf7a5",
  "hex",
);
