// A pushed message's data, encrypted from PUSH_PLAINTEXT under PUSH_PASSWORD
// and PUSH_T with IV "0123456789ab", which tuya-iot-python-sdk's own
// TuyaOpenMQ._decode_mq_message, at
// https://github.com/tuya/tuya-iot-python-sdk/commit/20a7c92898fdd44e559667bbf8f2bf6fdb1e9185,
// decrypts and verifies. No capture shows a message with its password. The
// status entries take their shape from
// https://github.com/tuya/tuya-home-assistant/issues/591.

export const PUSH_PASSWORD = "0123456789abcdefFEDCBA9876543210";
export const PUSH_T = 1636197093;
export const PUSH_DATA =
  "AAAADDAxMjM0NTY3ODlhYqic8HQziTCwQeCpSgdU5WBCdUy8cqSYWCj5jeYeW0lm6ZFORA5FKvN0CsXTuFpq7dqGHFTnKxb0K9YF0V6oa0WXlxvzYAjd13qr3asstM+70/MDQys1RqPvDuB6oZNb4u5Z3jvd4VsE3zgFmLM3Jlq6VL/6jPl6S8oWAcwDmTlqOr2KPUhtexdbuSVvpSVYFbg+QD4AWmeNMf/O6P08UeN1m3zBBCti+MZdp5JoMLGXk5pXZb3yboyivncJbkEM2qYVmXZ0zJrzPo3aP724ktHz0kjDbsY4TJYr5J7fKKdDF3o9yUpyluSFpvQfzfUhF509575HSrCyM4aVaap4v1ldBkg9RhiANvdlwa9t17ycjiYtCDRpkc+uEO/lzna7pci3ZC1gaUh0bCg9";
export const PUSH_PLAINTEXT =
  '{"dataId":"0c2525e5-0000-0000-0000-000000000000","devId":"bf0123456789abcdefgh","productKey":"t25mzpypc9tblzki","status":[{"1":true,"code":"switch","t":"1636197093","value":true},{"24":"001703de0017","code":"colour_data_v2","t":"1636197093","value":"{\\"h\\":23,\\"s\\":990,\\"v\\":23}"}]}';
