// Source: CONTROL, HEART_BEAT and DP_QUERY are numbered in
// https://github.com/codetheweb/tuyapi/commit/a0c412245dfe8aed089d20d4f512aef2348af8da,
// and UPDATEDPS in
// https://github.com/codetheweb/tuyapi/commit/4be9cc5de3048ab0f5eb97674ca964112d1d9452.
export const COMMANDS = {
  CONTROL: 0x07,
  HEART_BEAT: 0x09,
  DP_QUERY: 0x0a,
  UPDATEDPS: 0x12,
} as const;
