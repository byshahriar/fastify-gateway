import fp from "fastify-plugin";
import { HttpStatus } from "@/constants";
import type { AlertChannel } from "@/interfaces";
import { buildAlertChannels } from "@/utils";

/**
 * Chat-channel alerting plugin (feature flag: `ALERTS_ENABLED`). When enabled
 * and at least one webhook is configured, a 5xx response triggers a
 * notification to every configured Slack/Discord channel, throttled to at most
 * one notification per `ALERT_THROTTLE_MS` to avoid flooding the channel.
 * Delivery runs after the response is sent and never affects the client;
 * a failed webhook is logged, not raised.
 */
export default fp(
  async (fastify) => {
    if (!fastify.config.ALERTS_ENABLED) return;

    const channels = buildAlertChannels({
      slackUrl: fastify.config.SLACK_WEBHOOK_URL,
      discordUrl: fastify.config.DISCORD_WEBHOOK_URL,
    });
    if (channels.length === 0) {
      fastify.log.warn("ALERTS_ENABLED but no SLACK_WEBHOOK_URL or DISCORD_WEBHOOK_URL set");
      return;
    }

    const throttleMs = fastify.config.ALERT_THROTTLE_MS;
    let lastSentAt = 0;

    async function send(channel: AlertChannel, message: string) {
      try {
        await fetch(channel.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(channel.format(message)),
        });
      } catch (err) {
        fastify.log.error({ err, channel: channel.name }, "alert delivery failed");
      }
    }

    fastify.addHook("onResponse", async (req, reply) => {
      if (reply.statusCode < HttpStatus.InternalServerError) return;

      const now = Date.now();
      if (now - lastSentAt < throttleMs) return;
      lastSentAt = now;

      // Route pattern, not the raw URL, to avoid leaking query strings.
      const route = req.routeOptions.url ?? req.url;
      const message = `:rotating_light: fastify-gateway: ${reply.statusCode} on ${req.method} ${route} (requestId ${req.id})`;
      await Promise.all(channels.map((channel) => send(channel, message)));
    });

    fastify.log.info({ channels: channels.map((c) => c.name) }, "chat alerting enabled");
  },
  { name: "alerts" },
);
