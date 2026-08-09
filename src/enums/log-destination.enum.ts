/**
 * Log channel(s) `LOG_DESTINATION` selects, singly or comma-combined (e.g.
 * `"console,file"`).
 */
export const LogDestination = {
  Console: "console",
  File: "file",
} as const;

/**
 * Union of the {@link LogDestination} values.
 */
export type LogDestination = (typeof LogDestination)[keyof typeof LogDestination];
