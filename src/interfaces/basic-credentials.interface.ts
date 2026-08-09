/**
 * Credentials carried by an HTTP Basic `Authorization` header.
 */
export interface BasicCredentials {
  /**
   * Decoded username.
   */
  username: string;
  /**
   * Decoded password.
   */
  password: string;
}
