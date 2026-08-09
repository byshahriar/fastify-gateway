/**
 * Per-request logging style `LOG_REQUEST_STYLE` selects.
 *
 * Declared as an `as const` object rather than a TypeScript `enum`; see
 * `enums/auth-scheme.enum.ts` for why.
 */
export const LogRequestStyle = {
  Fastify: "fastify",
  Single: "single",
  Off: "off",
} as const;

/**
 * Union of the {@link LogRequestStyle} values.
 */
export type LogRequestStyle = (typeof LogRequestStyle)[keyof typeof LogRequestStyle];
