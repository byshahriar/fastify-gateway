/**
 * Log channel(s) `LOG_DESTINATION` selects, singly or comma-combined (e.g.
 * `"console,file"`).
 *
 * Declared as an `as const` object rather than a TypeScript `enum`; see
 * `enums/auth-scheme.enum.ts` for why.
 */
export const LogDestination = {
  Console: "console",
  File: "file",
} as const;

/**
 * Union of the {@link LogDestination} values.
 */
export type LogDestination = (typeof LogDestination)[keyof typeof LogDestination];
