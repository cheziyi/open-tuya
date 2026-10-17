// No source's tests capture a TCP frame from a 3.3, 3.4 or 3.5 device, or a
// session key negotiation. Each value here was computed from the inputs below
// by tinytuya's own code at
// https://github.com/jasonacox/tinytuya/commit/3c0a687d442dc68e13eeafad39062526b20c109a.
// tuyapi's code at
// https://github.com/codetheweb/tuyapi/commit/4135c835deaa7c94ad0df9dd4c34878cb5eb2916
// gave the same bytes for each frame a client sends, and read each frame a
// device sends back to the same payload.

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

export const STATUS_PLAINTEXT = '{"dps":{"1":true},"t":1700000000}';

// A STATUS frame as a device sends it, sequence number 7, return code 0,
// carrying STATUS_PLAINTEXT under LOCAL_KEY. tinytuya built it and tuyapi
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

// The IV of each 3.5 frame below: tuyapi takes the first 12 digits of
// Date.now() * 10, so Date.now() returned 12345678901.
export const V35_IV = Buffer.from("123456789010");

export const CONTROL_PLAINTEXT = '{"dps":{"1":true}}';

// CONTROL, sequence number 2, carrying CONTROL_PLAINTEXT under LOCAL_KEY.
export const V33_CONTROL = Buffer.from(
  "000055aa000000020000000700000037332e33000000000000000000000000c27ee03f8b" +
    "e481e63320de7dc6eb429664215f365b0dad6b2ac8fab15b1d40bd81908fde0000aa55",
  "hex",
);

// STATUS as a device sends it, sequence number 0, return code 0, carrying
// STATUS_PLAINTEXT under LOCAL_KEY behind the "3.3" header.
export const V33_STATUS = Buffer.from(
  "000055aa00000000000000080000004b00000000332e33000000000000000000000000c2" +
    "7ee03f8be481e63320de7dc6eb429663b24a59ee099bd2f7b35626f9034f7903000aeb4f" +
    "f51d29188f82e4a162a1f6dee9949b0000aa55",
  "hex",
);

// SESS_KEY_NEG_RESP as a device sends it, sequence number 0x9f70, return code
// 0, carrying SESSION_KEY_RESPONSE under LOCAL_KEY.
export const V34_SESSION_KEY_RESPONSE = Buffer.from(
  "000055aa00009f700000000400000068000000000b4bd671f6707f09b838c3d6ca1c6a3d" +
    "34a8706148aba7b9e47b4fd03c3428475216353fe75fa1cb7918233866ab9feb377222e0" +
    "61a924c591cd9c27ea163ed4a931e4f6469ee60f8f46b214924e0529a80bd58c11be77e5" +
    "1f55c75d186a57870000aa55",
  "hex",
);

// HEART_BEAT, sequence number 3, with an empty payload padded to one block
// under V34_SESSION_KEY.
export const V34_HEART_BEAT = Buffer.from(
  "000055aa00000003000000090000003450ea1e29ebec0ee2a37a3dad0112945704ccc1df" +
    "96d57268bf0f3f5637486b11522d9f3405ad98a0cfc3a8c93bb94e000000aa55",
  "hex",
);

// HEART_BEAT, sequence number 3, with no payload at all under
// V34_SESSION_KEY. tinytuya built it and tuyapi read it back.
export const V34_EMPTY_HEART_BEAT = Buffer.from(
  "000055aa0000000300000009000000245a3ba6ac0d71e0efc1181b20db2a54d6c2d8b5" +
    "9b1a8cc0d1e4543139a6a913b20000aa55",
  "hex",
);

// SESS_KEY_NEG_START, sequence number 1, carrying LOCAL_NONCE under LOCAL_KEY.
export const V35_SESSION_KEY_START = Buffer.from(
  "00006699000000000001000000030000002c31323334353637383930313031f4b00e08b1" +
    "2f3e2776d129ad2292f9ac7f867ae3f548a0856546f25207212a00009966",
  "hex",
);

// SESS_KEY_NEG_RESP as a device sends it, sequence number 0xed65, return code
// 0, carrying SESSION_KEY_RESPONSE under LOCAL_KEY.
export const V35_SESSION_KEY_RESPONSE = Buffer.from(
  "0000669900000000ed65000000040000005031323334353637383930313001c5823d5ae1" +
    "7d6a7d2e8973f970c2abc958c4c1da59795195f3f20888d4da32e0b6d9e6e6a0172e654d" +
    "fedaccfcd247a969e9bcecaba7b5bd173f764ed2001203167fa500009966",
  "hex",
);

// HEART_BEAT, sequence number 3, with an empty payload under V35_SESSION_KEY.
export const V35_HEART_BEAT = Buffer.from(
  "00006699000000000003000000090000001c3132333435363738393031304a869d2af043" +
    "ca9433f735d7755f5cc300009966",
  "hex",
);

// STATUS as a device sends it, sequence number 0xed66, return code 0, carrying
// STATUS_PLAINTEXT under V35_SESSION_KEY behind the "3.5" header.
export const V35_STATUS = Buffer.from(
  "0000669900000000ed6600000008000000503132333435363738393031307e3665aeff36" +
    "2d99feeba8e7574f5700f7aedfe9fddc72867c8caa916430eca091c97d0e1ffd9327ee06" +
    "ac6d8b015afa1927b34642ae2ebb708423919cffb4a2f8be660d00009966",
  "hex",
);

// A client's REQ_DEVINFO, sequence number 0, carrying
// {"from":"app","ip":"192.168.1.10"} under the broadcast key with the IV
// DISCOVERY_REQUEST_IV. tinytuya's code above and homebridge-tuya-plus's code at
// https://github.com/adrianjagielak/homebridge-tuya-plus/commit/8b0c47b2095a3d1e24ef97a7ac3aa7c4be685d91
// gave the same bytes. tuyapi does not build one.
export const DISCOVERY_REQUEST_IP = "192.168.1.10";
export const DISCOVERY_REQUEST_IV = Buffer.from("0123456789ab");
export const DISCOVERY_REQUEST = Buffer.from(
  "00006699000000000000000000250000003e3031323334353637383961627f0e835e" +
    "0dc9a2e1b3e59a027287fb6b6f25ce36b3b18f073545b9be65ea1cdf1b473f7aa91e2323" +
    "36c3456e20ae37affc4c00009966",
  "hex",
);
