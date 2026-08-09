import { AlertChannelKind } from "@/enums";

/**
 * A chat channel an alert notification can be delivered to.
 */
export interface AlertChannel {
  /**
   * Channel identifier used in logs. Never `AlertChannelKind.None` — a
   * channel object is only ever constructed for an actually-selected
   * channel; see `selectAlertChannel` in `utils/alert-channels.util.ts`.
   */
  name: Exclude<AlertChannelKind, typeof AlertChannelKind.None>;
  /**
   * Incoming webhook URL.
   */
  url: string;
  /**
   * Builds the channel-specific request body for a message.
   *
   * @param message - The alert text.
   * @returns The JSON payload to POST to {@link url}.
   */
  format(message: string): unknown;
}
