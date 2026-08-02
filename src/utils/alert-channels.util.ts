import type { AlertChannel } from "@/interfaces";

/**
 * Builds a Slack incoming-webhook channel.
 *
 * @param url - Slack webhook URL.
 * @returns The channel; Slack expects a `{ text }` payload.
 */
export function slackChannel(url: string): AlertChannel {
  return { name: "slack", url, format: (message) => ({ text: message }) };
}

/**
 * Builds a Discord webhook channel.
 *
 * @param url - Discord webhook URL.
 * @returns The channel; Discord expects a `{ content }` payload.
 */
export function discordChannel(url: string): AlertChannel {
  return { name: "discord", url, format: (message) => ({ content: message }) };
}

/**
 * Builds the configured alert channels, skipping any without a URL.
 *
 * @param config - Slack and Discord webhook URLs (empty to disable).
 * @returns The enabled channels, in a stable order.
 */
export function buildAlertChannels(config: {
  slackUrl: string;
  discordUrl: string;
}): AlertChannel[] {
  const channels: AlertChannel[] = [];
  if (config.slackUrl) channels.push(slackChannel(config.slackUrl));
  if (config.discordUrl) channels.push(discordChannel(config.discordUrl));
  return channels;
}
