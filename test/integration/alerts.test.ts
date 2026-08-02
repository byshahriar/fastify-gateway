import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "@test/helpers/app";
import { deadUpstreamUrl, startUpstream, type TestUpstream } from "@test/helpers/upstream";

let app: FastifyInstance | undefined;
let slack: TestUpstream | undefined;
let discord: TestUpstream | undefined;

afterEach(async () => {
  await app?.close();
  await slack?.close();
  await discord?.close();
  app = slack = discord = undefined;
});

async function buildAlertingApp(overrides: Record<string, string> = {}) {
  slack = await startUpstream();
  discord = await startUpstream();
  app = await buildTestApp({
    ALERTS_ENABLED: "true",
    SLACK_WEBHOOK_URL: slack.url,
    DISCORD_WEBHOOK_URL: discord.url,
    ALERT_THROTTLE_MS: "0",
    PUBLIC_SERVICE_URL: await deadUpstreamUrl(),
    ...overrides,
  });
  return app;
}

describe("chat-channel alerting", () => {
  it("notifies Slack and Discord on a 5xx with channel-specific payloads", async () => {
    const gateway = await buildAlertingApp();

    const res = await gateway.inject({ method: "GET", url: "/api/public/status" });
    expect(res.statusCode).toBe(502);

    await vi.waitFor(() => {
      expect(slack!.requests).toHaveLength(1);
      expect(discord!.requests).toHaveLength(1);
    });

    expect(JSON.parse(slack!.requests[0].body)).toMatchObject({
      text: expect.stringContaining("502"),
    });
    expect(JSON.parse(discord!.requests[0].body)).toMatchObject({
      content: expect.stringContaining("502"),
    });
  });

  it("does not notify on a successful response", async () => {
    const gateway = await buildAlertingApp();

    await gateway.inject({ method: "GET", url: "/healthz" });
    // Give any (unexpected) delivery a chance to arrive.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(slack!.requests).toHaveLength(0);
    expect(discord!.requests).toHaveLength(0);
  });

  it("throttles rapid alerts to one per window", async () => {
    const gateway = await buildAlertingApp({ ALERT_THROTTLE_MS: "60000" });

    await gateway.inject({ method: "GET", url: "/api/public/a" });
    await vi.waitFor(() => expect(slack!.requests).toHaveLength(1));

    await gateway.inject({ method: "GET", url: "/api/public/b" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(slack!.requests).toHaveLength(1);
  });

  it("tolerates a failing webhook without crashing", async () => {
    slack = await startUpstream();
    app = await buildTestApp({
      ALERTS_ENABLED: "true",
      SLACK_WEBHOOK_URL: "http://127.0.0.1:1/dead",
      ALERT_THROTTLE_MS: "0",
      PUBLIC_SERVICE_URL: await deadUpstreamUrl(),
    });

    const res = await app.inject({ method: "GET", url: "/api/public/status" });
    expect(res.statusCode).toBe(502);

    const still = await app.inject({ method: "GET", url: "/healthz" });
    expect(still.statusCode).toBe(200);
  });

  it("boots and no-ops when enabled without any webhook URL", async () => {
    app = await buildTestApp({ ALERTS_ENABLED: "true" });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });
});
