import fp from "fastify-plugin";
import { HttpStatus } from "@/constants";
import { selectAlertChannel } from "@/utils";

/**
 * Chat-channel alerting plugin (feature flag: `ALERTS_ENABLED`). When enabled
 * with `ALERT_CHANNEL` set to a configured channel, a 5xx response posts a
 * notification to that single channel (Slack or Discord), throttled to at most
 * one per `ALERT_THROTTLE_MS` to avoid flooding it. Delivery runs after the
 * response is sent and never affects the client; a failed webhook is logged,
 * not raised.
 */
export default fp(
  async (fastify) => {
    if (!fastify.config.ALERTS_ENABLED) return;

    const channel = selectAlertChannel({
      channel: fastify.config.ALERT_CHANNEL,
      slackUrl: fastify.config.SLACK_WEBHOOK_URL,
      discordUrl: fastify.config.DISCORD_WEBHOOK_URL,
    });
    if (!channel) {
      fastify.log.warn(
        "ALERTS_ENABLED but ALERT_CHANNEL is not set to a channel with a configured webhook URL",
      );
      return;
    }

    const throttleMs = fastify.config.ALERT_THROTTLE_MS;
    let lastSentAt = 0;

    fastify.addHook("onResponse", async (req, reply) => {
      if (reply.statusCode < HttpStatus.InternalServerError) return;

      const now = Date.now();
      if (now - lastSentAt < throttleMs) return;
      lastSentAt = now;

      // Route pattern, not the raw URL, to avoid leaking query strings.
      const route = req.routeOptions.url ?? req.url;
      const message = `:rotating_light: fastify-gateway: ${reply.statusCode} on ${req.method} ${route} (requestId ${req.id})`;

      try {
        await fetch(channel.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(channel.format(message)),
        });
      } catch (err) {
        fastify.log.error({ err, channel: channel.name }, "alert delivery failed");
      }
    });

    fastify.log.info({ channel: channel.name }, "chat alerting enabled");
  },
  { name: "alerts" },
);
