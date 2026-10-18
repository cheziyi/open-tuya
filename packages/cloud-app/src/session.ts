/** What signing in yields, and all `createAppCloudAccount` needs to go on.
 * It is plain JSON: persist it. Its refresh token works once, so persist each
 * session `onSessionChange` hands on, and never use one session in two
 * programs at once: each refresh ends the other's session. */
export interface AppCloudSession {
  /** The API's origin for the account's region, such as
   * `https://apigw.tuyaeu.com`. */
  endpoint: string;
  accessToken: string;
  refreshToken: string;
  /** When the access token expires, in milliseconds since the epoch. */
  expiresAtInMs: number;
}
