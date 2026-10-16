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
