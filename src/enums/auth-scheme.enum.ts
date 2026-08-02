/**
 * Edge authentication schemes enforced before a request is proxied.
 *
 * Declared as an `as const` object rather than a TypeScript `enum` because
 * the project enforces `erasableSyntaxOnly` — enums generate runtime code,
 * which would break Node's native type stripping.
 */
export const AuthScheme = {
  None: "none",
  ApiKey: "api-key",
  Basic: "basic",
  Jwt: "jwt",
} as const;

/**
 * Union of the {@link AuthScheme} values.
 */
export type AuthScheme = (typeof AuthScheme)[keyof typeof AuthScheme];
