import type { BasicCredentials } from "@/interfaces";

const BASIC_SCHEME_PATTERN = /^basic +(.+)$/i;

/**
 * Parses a comma-separated `username:password` list (the `BASIC_AUTH_USERS`
 * format) into a lookup map. Passwords may contain colons; usernames may not.
 *
 * @param raw - Raw list, e.g. `"alice:pw1,bob:pw2"`.
 * @returns Map of username to password.
 * @throws Error When an entry is malformed, so invalid configuration is
 *   rejected at boot.
 */
export function parseUserList(raw: string): Map<string, string> {
  const users = new Map<string, string>();

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const separator = trimmed.indexOf(":");
    if (separator <= 0 || separator === trimmed.length - 1) {
      throw new Error(
        'Invalid BASIC_AUTH_USERS entry: expected "username:password" with non-empty parts',
      );
    }

    const username = trimmed.slice(0, separator);
    if (users.has(username)) {
      throw new Error(`Duplicate username in BASIC_AUTH_USERS: "${username}"`);
    }

    users.set(username, trimmed.slice(separator + 1));
  }

  return users;
}

/**
 * Decodes an `Authorization: Basic <base64>` header value.
 *
 * @param header - Raw header value, if present.
 * @returns The decoded credentials, or `null` for a missing header, a
 *   non-Basic scheme, or a payload without a colon.
 */
export function parseBasicAuthHeader(header: string | undefined): BasicCredentials | null {
  if (!header) return null;

  const match = BASIC_SCHEME_PATTERN.exec(header.trim());
  if (!match) return null;

  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return null;

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

/**
 * Encodes credentials as an `Authorization` header value.
 *
 * @param credentials - Credentials in `username:password` form.
 * @returns The `Basic <base64>` header value.
 */
export function encodeBasicAuth(credentials: string): string {
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}
