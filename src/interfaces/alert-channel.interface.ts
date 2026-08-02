/** A chat channel an alert notification can be delivered to. */
export interface AlertChannel {
  /** Channel identifier used in logs, e.g. `"slack"`. */
  name: string;
  /** Incoming webhook URL. */
  url: string;
  /**
   * Builds the channel-specific request body for a message.
   *
   * @param message - The alert text.
   * @returns The JSON payload to POST to {@link url}.
   */
  format(message: string): unknown;
}
