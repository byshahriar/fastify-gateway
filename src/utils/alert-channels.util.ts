import { AlertChannelKind } from "@/enums";
import type { AlertChannel } from "@/interfaces";

/**
 * Builds a Slack incoming-webhook channel.
 *
 * @param url - Slack webhook URL.
 * @returns The channel; Slack expects a `{ text }` payload.
 */
export function slackChannel(url: string): AlertChannel {
  return { name: AlertChannelKind.Slack, url, format: (message) => ({ text: message }) };
}

/**
 * Builds a Discord webhook channel.
 *
 * @param url - Discord webhook URL.
 * @returns The channel; Discord expects a `{ content }` payload.
 */
export function discordChannel(url: string): AlertChannel {
  return { name: AlertChannelKind.Discord, url, format: (message) => ({ content: message }) };
}

/**
 * Resolves the single active alert channel from configuration.
 *
 * @param config - The selected channel and the webhook URLs.
 * @returns The chosen channel, or `null` when the selection is `none`,
 *   unrecognized, or the selected channel has no webhook URL.
 */
export function selectAlertChannel(config: {
  channel: string;
  slackUrl: string;
  discordUrl: string;
}): AlertChannel | null {
  if (config.channel === AlertChannelKind.Slack) {
    return config.slackUrl ? slackChannel(config.slackUrl) : null;
  }
  if (config.channel === AlertChannelKind.Discord) {
    return config.discordUrl ? discordChannel(config.discordUrl) : null;
  }
  return null;
}
