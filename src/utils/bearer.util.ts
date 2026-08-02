const BEARER_PATTERN = /^bearer +(\S+)$/i;

/**
 * Extracts the token from an `Authorization: Bearer <token>` header.
 *
 * @param header - Raw header value, if present.
 * @returns The token, or `null` when the header is missing or not a Bearer
 *   value.
 */
export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = BEARER_PATTERN.exec(header.trim());
  return match ? match[1] : null;
}
