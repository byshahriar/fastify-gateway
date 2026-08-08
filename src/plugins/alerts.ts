import fp from "fastify-plugin";
import pRetry from "p-retry";
import { alertThreshold, selectAlertChannel, severityForStatus } from "@/utils";

// Bound each webhook attempt so an endpoint that accepts the connection but
// never responds cannot hold a delivery promise open for minutes.
const WEBHOOK_TIMEOUT_MS = 5000;

/**
 * Chat-channel alerting plugin (feature flag: `ALERTS_ENABLED`). When enabled
 * with `ALERT_CHANNEL` set to a configured channel, a response at or above the
 * `ALERT_LEVEL` threshold (`error` = 5xx, `warn` = 4xx + 5xx) posts a
 * notification to that single channel (Slack or Discord), throttled to at most
 * one per `ALERT_THROTTLE_MS` to avoid flooding it. Delivery is retried with
 * exponential backoff (`ALERT_RETRIES`), runs after the response is sent so it
 * never affects the client, and a webhook that fails every attempt is logged
 * rather than raised.
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
    const retries = fastify.config.ALERT_RETRIES;
    const threshold = alertThreshold(fastify.config.ALERT_LEVEL);
    let lastSentAt = 0;

    async function deliver(message: string) {
      const body = JSON.stringify(channel!.format(message));
      await pRetry(
        async () => {
          const res = await fetch(channel!.url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
          });
          // fetch does not reject on HTTP errors; throw so p-retry retries.
          if (!res.ok) throw new Error(`webhook responded ${res.status}`);
        },
        { retries, minTimeout: 200, factor: 2 },
      );
    }

    fastify.addHook("onResponse", async (req, reply) => {
      if (reply.statusCode < threshold) return;

      const now = Date.now();
      if (now - lastSentAt < throttleMs) return;
      lastSentAt = now;

      const severity = severityForStatus(reply.statusCode);
      const icon = severity === "error" ? ":rotating_light:" : ":warning:";
      // Route pattern, not the raw URL, to avoid leaking query strings.
      const route = req.routeOptions.url ?? req.url;
      const message = `${icon} fastify-gateway [${severity}]: ${reply.statusCode} on ${req.method} ${route} (requestId ${req.id})`;

      // Fire-and-forget: delivery (with retries and backoff) must never hold
      // the request lifecycle open.
      void deliver(message).catch((err) => {
        fastify.log.error(
          { err, channel: channel.name },
          "alert delivery failed after retries",
        );
      });
    });

    fastify.log.info(
      { channel: channel.name, level: fastify.config.ALERT_LEVEL },
      "chat alerting enabled",
    );
  },
  { name: "alerts" },
);
