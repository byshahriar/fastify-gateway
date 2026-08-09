/**
 * Selectable alert channel. Exactly one is active at a time, chosen by the
 * `ALERT_CHANNEL` configuration.
 *
 * Declared as an `as const` object rather than a TypeScript `enum`; see
 * `enums/auth-scheme.enum.ts` for why.
 */
export const AlertChannelKind = {
  None: "none",
  Slack: "slack",
  Discord: "discord",
} as const;

/**
 * Union of the {@link AlertChannelKind} values.
 */
export type AlertChannelKind = (typeof AlertChannelKind)[keyof typeof AlertChannelKind];
