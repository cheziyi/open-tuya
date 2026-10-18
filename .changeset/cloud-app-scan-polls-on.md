---
"@open-tuya/cloud-app": patch
---

`QrLogin.waitForScan` polls on through a poll that times out, cannot connect or is rate limited, rather than rejecting.
