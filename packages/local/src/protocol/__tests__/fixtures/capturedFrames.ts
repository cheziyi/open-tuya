import { createHash } from "node:crypto";

// Source: A 3.3 device's UDP broadcast, captured in hass-localtuya's
// tests/test_discovery.py as DEVICE3_3, in
// https://github.com/xZetsubou/hass-localtuya/commit/aeb5f9ce4c07c57e7868f296978fed4a2a5e9f18.
export const V33_BROADCAST = Buffer.from(
  "000055aa00000000000000130000009c00000000d09766676f3369eb10b5e9f132fd802a" +
    "fc4ca407f48b9841ade064bda7369da2b65e62eadc371db4212798ca042bffc3d9495fff" +
    "174c2902e45e3b3aad248f5ec2fb8459b1155fc75d4bf6699f92cba4c0ba520148045e76" +
    "05fa0498dfea5aabf1b1327308c3927111c62148942a2bc196cbf5621638ef100164bb81" +
    "946ea85d6eda8eea40e93b1e3fc14a2570e182796633d2f10000aa55",
  "hex",
);

// Source: A 3.3 broadcast is encrypted under the MD5 of "yGAdlopoPVldABfn" in
// https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db.
export const BROADCAST_KEY = createHash("md5")
  .update("yGAdlopoPVldABfn")
  .digest();

export const V33_BROADCAST_PLAINTEXT =
  '{"ip":"192.168.1.39","gwId":"bf99cefbbe3b010080nunb","active":2,' +
  '"ablilty":0,"encrypt":true,"productKey":"keya4gvchmtapm8n","version":"3.3"}';

// Source: AES-128-ECB of this JSON under this key, from tuyapi's
// test/cipher.js, in
// https://github.com/codetheweb/tuyapi/commit/31a0cabf76149e29391b08409f9be1bfa7cabc0c.
export const TUYAPI_KEY = Buffer.from("bbe88b3f4106d354");
export const TUYAPI_PLAINTEXT =
  '{"devId":"002004265ccf7fb1b659","dps":{"1":false,"2":0},"t":1529442366,"s":8}';
export const TUYAPI_CIPHERTEXT = Buffer.from(
  "zrA8OK3r3JMiUXpXDWauNppY4Am2c8rZ6sb4Yf15MjM8n5ByDx+QWeCZtcrPqddxLrhm906bSKbQAFtT1uCp+zP5AxlqJf5d0Pp2OxyXyjg=",
  "base64",
);

// Source: A 3.5 device's UDP broadcast, captured in hass-localtuya's
// tests/test_discovery.py as DEVICE3_5, in
// https://github.com/xZetsubou/hass-localtuya/commit/aeb5f9ce4c07c57e7868f296978fed4a2a5e9f18.
// It is encrypted under BROADCAST_KEY.
export const V35_BROADCAST = Buffer.from(
  "0000669900000000000000000013000000f0930720d5927ecff2918553dc9f8d593d6453" +
    "18ca3eaec2cfe76956f27bc421e7b80069114b116a0e35ed8ce76d4f9163ce4147537f40" +
    "d6120ace92b49ae5eff48edfd3e1da0d74f1ee1b867ab2389a11eb789ce49b1974364c13" +
    "4a5a37e7a688b9a9ccf931dc8f1d253e13104d27ee479ef7e5d6de4b3157e0a9f58c5ca1" +
    "d63c1e1e63fbc92043569da34340491c15b43d36a0ce0a2bef1cc196f15fc05932e2cdc4" +
    "6aa748cfe142e1ed5e98fe3bf1503a2125822ac9f6bd178ed9b5dfba198d039bfa009973" +
    "d6740e443d26d8d1d78237ecacf2198afe941fd5e6e161c1fb2031a8f45d766418ed863c" +
    "1113de14f2ba00009966",
  "hex",
);

export const V35_BROADCAST_PLAINTEXT =
  '{"ip":"192.168.1.104","gwId":"bfb7475dbdef49284eu4xe","uuid":"678a6c23563c5e29",' +
  '"active":2,"ablilty":0,"encrypt":true,"productKey":"key8u54q9dtru5jw",' +
  '"version":"3.5","token":true,"wf_cfg":true,"clientLink":1}';

// Source: A 3.4 device's UDP broadcast, captured in hass-localtuya's
// tests/test_discovery.py as DEVICE3_4, in
// https://github.com/xZetsubou/hass-localtuya/commit/aeb5f9ce4c07c57e7868f296978fed4a2a5e9f18.
// It is encrypted under BROADCAST_KEY.
export const V34_BROADCAST = Buffer.from(
  "000055aa0000000000000023000000bc00000000d09766676f3369eb10b5e9f132fd" +
    "802a4c2be52c54287a15b0282be388a4540e5962dd10b3f166258fffbc11713e2d7d2daf" +
    "5f6b72db943fb08244c3e4ee98f0c2fb8459b1155fc75d4bf6699f92cba4c0ba52014804" +
    "5e7605fa0498dfea5aab27a7afd2bd6d46ef72b6df69a156002d3c9dd03574ec0e0b0d8f" +
    "860f374b41980616cd44036f7601ab71f0aa8391a55ce0913a793742322b90964948dad4" +
    "b60cc0097b6cdcaa5a148223b3246686a12ebb96315b0000aa55",
  "hex",
);

export const V34_BROADCAST_PLAINTEXT =
  '{"ip":"192.168.1.36","gwId":"bf36eb3bd9f27a4264yxu1","active":2,"ablilty":0,' +
  '"encrypt":true,"productKey":"key5ckdnys3pqgec","version":"3.4","token":true,' +
  '"wf_cfg":true}';

// Source: A 3.5 bulb's UDP broadcast to port 6667, captured in
// https://github.com/jasonacox/tinytuya/issues/247#issuecomment-1372462132.
// It is encrypted under BROADCAST_KEY.
export const V35_BULB_BROADCAST = Buffer.from(
  "0000669900000000000000000013000000efe65fbad09a1e4ccc27460c65e6b04158" +
    "948c7dc9d3dff15b87551661dca6294f7f0237760e840a9c313247140a191385d89b5f2b" +
    "b9262a37258ee962ba9022b15ab59faaccdcada29a8ffb7a3d3635471cab5a4ec9458127" +
    "90aa7e4b4e8b136bcc721319398f92f510f8b4ebe9a83380e052c9e7de90d7900811dca0" +
    "93c940b4307566ce827c94938be9315f96df33c294c4056fc4af4e316f21125ecb85a0ce" +
    "fdb8af472d44dbd8587987c2c0d811cc05f3227337ac888dec88f06a672eba0160deb376" +
    "9a0367a2580001c2d022c1415b1e0f753b2617f0325c9af45e847494014f9b1438d7f7ae" +
    "6b73822cff60ad00009966",
  "hex",
);

export const V35_BULB_BROADCAST_PLAINTEXT =
  '{"ip":"192.168.2.46","gwId":"ebf310edb88d15f0edyr5i","uuid":"60b308e46e1b5871",' +
  '"active":2,"ablilty":0,"encrypt":true,"productKey":"key8u54q9dtru5jw",' +
  '"version":"3.5","token":true,"wf_cfg":true,"clientLink":3}';

// Source: A 3.3 device's error reply to DP_QUERY, sequence number 1, return
// code 1, with the device's local key, captured in
// https://github.com/codetheweb/tuyapi/issues/577.
export const V33_QUERY_ERROR_KEY = Buffer.from("d18579be1d0c1295");
export const V33_QUERY_ERROR = Buffer.from(
  "000055aa000000010000000a0000002c00000001683483b1c0730f381ef013cc7fdf16a7" +
    "181ea1c34d49c2d16295f431b232b7a812efe1260000aa55",
  "hex",
);
export const V33_QUERY_ERROR_PLAINTEXT = "parse data error";

// Source: A client's DP_QUERY_NEW to a 3.5 device, sequence number 3,
// carrying "{}" with the IV "0123456789ab", and the device's error reply,
// sequence number 0xf216, return code 1 little-endian, with the session key
// they agreed, captured in https://github.com/jasonacox/tinytuya/issues/658.
export const V35_QUERY_SESSION_KEY = Buffer.from(
  "eb61cd30ad4324398ca95596909ee017",
  "hex",
);
export const V35_QUERY_IV = Buffer.from("0123456789ab");
export const V35_QUERY = Buffer.from(
  "00006699000000000003000000100000001e303132333435363738396162d52718d0bc16" +
    "7524009d6768ce0ffcad64ba00009966",
  "hex",
);
export const V35_QUERY_ERROR = Buffer.from(
  "0000669900000000f21600000010000000350f5c15da38c0f3cad3b93e0272ae9b66dd8f" +
    "eb12ee40b11b540c644be2230c4c6053ca917acfcd4a69eb4b45ec12ffc5a411a6f3f2" +
    "00009966",
  "hex",
);
export const V35_QUERY_ERROR_PLAINTEXT = "json obj data unvalid";

// Source: A 3.3 device's reply to DP_QUERY, decrypted, captured in
// https://github.com/jasonacox/tinytuya/issues/732.
export const V33_QUERY_REPLY_PLAINTEXT =
  '{"dps":{"20":true,"21":"colour","24":"003c000003e8","25":"000e0d00002e03e802cc00000000","26":0,"34":false,"42":"010000016432000003e8007803e800f003e8003c03e800b403e8012c03e8"}}';

// Source: A 3.3 device's STATUS, decrypted, captured in
// https://github.com/xZetsubou/hass-localtuya/issues/775.
export const V33_STATUS_PLAINTEXT = '{"dps":{"3":0},"t":1769807713}';

// Source: A 3.5 device's reply to DP_QUERY_NEW, decrypted, captured in
// https://github.com/xZetsubou/hass-localtuya/issues/877.
export const V35_QUERY_REPLY_PLAINTEXT =
  '{"dps":{"20":false,"21":"colour","22":140,"23":10,"24":"000003e803e8","46":1000,"47":1000,"53":154,"101":"TM1809","102":"BRG"}}';

// Source: A 3.5 device's STATUS, decrypted, after its return code and version
// header, captured in
// https://github.com/jasonacox/tinytuya/discussions/260#discussioncomment-14066063.
export const V35_STATUS_PLAINTEXT =
  '{"protocol":4,"t":1754855226,"data":{"dps":{"20":false}}}';
// The version header in front of V35_STATUS_PLAINTEXT, as the device wrote
// it: "3.5", a zero CRC, serial number 0x3561 and source ID 1.
export const V35_STATUS_VERSION_HEADER = Buffer.from(
  "332e35000000000000356100000001",
  "hex",
);
