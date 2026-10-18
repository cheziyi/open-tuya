---
"open-tuya": minor
---

Re-export the changes in `@open-tuya/core`, `@open-tuya/local` and `@open-tuya/devices` that need your code edited: a `TuyaClient` you implement needs `connected`, and its `close()` returns a promise; a `switch` over every `ProtocolVersion` needs cases for `"3.1"` and `"3.2"`; `LocalTuyaClient`'s constructor takes one options object; and catalog controls are renamed, such as `currentAInA` to `currentPhaseAInA`, with `absent` now `whenAbsent`. Each package's changelog lists the rest.
