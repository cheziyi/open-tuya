---
"@open-tuya/devices": minor
---

Name controls in full words, with each unit after `In` and each phase named. A meter's `currentAInA` is now `currentPhaseAInA`, `voltageBInV` is `voltagePhaseBInV`, and so on for power and energy; `tempSetF` is `targetTemperatureInF`, `unlockTempPwd` is `unlockTemporaryPassword`, `uvIndexInUvIndex` is `uvIndex`; `CONTROL_NAMES` follows. Rename where you read or write these controls.
