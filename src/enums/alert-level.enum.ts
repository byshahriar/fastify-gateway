/**
 * Lowest response class that triggers an alert. `error` alerts on 5xx only;
 * `warn` also alerts on 4xx client errors.
 */
export const AlertLevel = {
  Error: "error",
  Warn: "warn",
} as const;

/** Union of the {@link AlertLevel} values. */
export type AlertLevel = (typeof AlertLevel)[keyof typeof AlertLevel];
