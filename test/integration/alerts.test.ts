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
    ALERT_CHANNEL: "slack",
    SLACK_WEBHOOK_URL: slack.url,
    DISCORD_WEBHOOK_URL: discord.url,
    ALERT_THROTTLE_MS: "0",
    PUBLIC_SERVICE_URL: await deadUpstreamUrl(),
    ...overrides,
  });
  return app;
}

describe("chat-channel alerting", () => {
  it("notifies only the selected channel on a 5xx", async () => {
    const gateway = await buildAlertingApp({ ALERT_CHANNEL: "slack" });

    const res = await gateway.inject({ method: "GET", url: "/api/public/status" });
    expect(res.statusCode).toBe(502);

    await vi.waitFor(() => expect(slack!.requests).toHaveLength(1));
    expect(JSON.parse(slack!.requests[0].body)).toMatchObject({
      text: expect.stringContaining("502"),
    });

    // The unselected channel is never contacted.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(discord!.requests).toHaveLength(0);
  });

  it("uses Discord when it is the selected channel", async () => {
    const gateway = await buildAlertingApp({ ALERT_CHANNEL: "discord" });

    await gateway.inject({ method: "GET", url: "/api/public/status" });

    await vi.waitFor(() => expect(discord!.requests).toHaveLength(1));
    expect(JSON.parse(discord!.requests[0].body)).toMatchObject({
      content: expect.stringContaining("502"),
    });
    expect(slack!.requests).toHaveLength(0);
  });

  it("does not notify on a successful response", async () => {
    const gateway = await buildAlertingApp();

    await gateway.inject({ method: "GET", url: "/healthz" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(slack!.requests).toHaveLength(0);
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
    app = await buildTestApp({
      ALERTS_ENABLED: "true",
      ALERT_CHANNEL: "slack",
      SLACK_WEBHOOK_URL: "http://127.0.0.1:1/dead",
      ALERT_THROTTLE_MS: "0",
      PUBLIC_SERVICE_URL: await deadUpstreamUrl(),
    });

    const res = await app.inject({ method: "GET", url: "/api/public/status" });
    expect(res.statusCode).toBe(502);

    const still = await app.inject({ method: "GET", url: "/healthz" });
    expect(still.statusCode).toBe(200);
  });

  it("boots and no-ops when enabled with ALERT_CHANNEL=none", async () => {
    app = await buildTestApp({ ALERTS_ENABLED: "true", ALERT_CHANNEL: "none" });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("refuses to start with an invalid ALERT_CHANNEL", async () => {
    await expect(
      buildTestApp({ ALERTS_ENABLED: "true", ALERT_CHANNEL: "telegram" }),
    ).rejects.toThrow();
  });
});
