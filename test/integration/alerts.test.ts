import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { AlertChannelKind, AlertLevel } from "@/enums";
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
    ALERT_CHANNEL: AlertChannelKind.Slack,
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
    const gateway = await buildAlertingApp({ ALERT_CHANNEL: AlertChannelKind.Slack });

    const res = await gateway.inject({ method: "GET", url: "/api/public/status" });
    expect(res.statusCode).toBe(502);

    await vi.waitFor(() => expect(slack!.requests).toHaveLength(1));
    expect(JSON.parse(slack!.requests[0].body)).toMatchObject({
      text: expect.stringContaining("502"),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(discord!.requests).toHaveLength(0);
  });

  it("uses Discord when it is the selected channel", async () => {
    const gateway = await buildAlertingApp({ ALERT_CHANNEL: AlertChannelKind.Discord });

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
      ALERT_CHANNEL: AlertChannelKind.Slack,
      SLACK_WEBHOOK_URL: "http://127.0.0.1:1/dead",
      ALERT_THROTTLE_MS: "0",
      ALERT_RETRIES: "0",
      PUBLIC_SERVICE_URL: await deadUpstreamUrl(),
    });

    const res = await app.inject({ method: "GET", url: "/api/public/status" });
    expect(res.statusCode).toBe(502);

    const still = await app.inject({ method: "GET", url: "/healthz" });
    expect(still.statusCode).toBe(200);
  });

  it("retries delivery on a transient webhook failure", async () => {
    let attempts = 0;
    const flaky: Server = createServer((req, res) => {
      attempts += 1;
      req.resume();
      req.on("end", () => {
        res.writeHead(attempts === 1 ? 503 : 200).end("{}");
      });
    });
    await new Promise<void>((resolve) => flaky.listen(0, "127.0.0.1", resolve));
    const { port } = flaky.address() as AddressInfo;

    try {
      app = await buildTestApp({
        ALERTS_ENABLED: "true",
        ALERT_CHANNEL: AlertChannelKind.Slack,
        SLACK_WEBHOOK_URL: `http://127.0.0.1:${port}`,
        ALERT_THROTTLE_MS: "0",
        ALERT_RETRIES: "2",
        PUBLIC_SERVICE_URL: await deadUpstreamUrl(),
      });

      await app.inject({ method: "GET", url: "/api/public/status" });
      await vi.waitFor(() => expect(attempts).toBe(2), { timeout: 3000 });
    } finally {
      flaky.closeAllConnections();
      await new Promise<void>((resolve) => flaky.close(() => resolve()));
    }
  });

  it("boots and no-ops when enabled with ALERT_CHANNEL=none", async () => {
    app = await buildTestApp({ ALERTS_ENABLED: "true", ALERT_CHANNEL: AlertChannelKind.None });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("refuses to start with an invalid ALERT_CHANNEL", async () => {
    await expect(
      buildTestApp({ ALERTS_ENABLED: "true", ALERT_CHANNEL: "telegram" }),
    ).rejects.toThrow();
  });
});

describe("alert level", () => {
  it("labels a 5xx alert as error at the default level", async () => {
    const gateway = await buildAlertingApp();

    await gateway.inject({ method: "GET", url: "/api/public/status" });

    await vi.waitFor(() => expect(slack!.requests).toHaveLength(1));
    expect(JSON.parse(slack!.requests[0].body).text).toContain("[error]");
  });

  it("does not alert on a 4xx at the error level", async () => {
    const gateway = await buildAlertingApp();

    await gateway.inject({ method: "GET", url: "/nope" }); // 404
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(slack!.requests).toHaveLength(0);
  });

  it("alerts on a 4xx as warning at the warn level", async () => {
    const gateway = await buildAlertingApp({ ALERT_LEVEL: AlertLevel.Warn });

    const res = await gateway.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);

    await vi.waitFor(() => expect(slack!.requests).toHaveLength(1));
    const text = JSON.parse(slack!.requests[0].body).text;
    expect(text).toContain("[warning]");
    expect(text).toContain("404");
  });

  it("refuses to start with an invalid ALERT_LEVEL", async () => {
    await expect(
      buildTestApp({
        ALERTS_ENABLED: "true",
        ALERT_CHANNEL: AlertChannelKind.Slack,
        ALERT_LEVEL: "debug",
      }),
    ).rejects.toThrow();
  });
});
