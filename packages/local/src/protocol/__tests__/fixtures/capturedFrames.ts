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
