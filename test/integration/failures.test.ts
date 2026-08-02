import { describe, expect, it } from "vitest";
import { buildTestApp } from "@test/helpers/app";
import { deadUpstreamUrl, startUpstream } from "@test/helpers/upstream";

describe("upstream failures", () => {
  it("returns 502 when the upstream is unreachable", async () => {
    const app = await buildTestApp({ PUBLIC_SERVICE_URL: await deadUpstreamUrl() });

    const res = await app.inject({ method: "GET", url: "/api/public/status" });
    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.error).toBe("Upstream unavailable");
    expect(body.requestId).toBeTruthy();

    await app.close();
  });

  it("returns 504 when the upstream exceeds the response timeout", async () => {
    const slow = await startUpstream({ delayMs: 2_000 });
    const app = await buildTestApp({
      PUBLIC_SERVICE_URL: slow.url,
      UPSTREAM_TIMEOUT_MS: "250",
    });

    const res = await app.inject({ method: "GET", url: "/api/public/slow" });
    expect(res.statusCode).toBe(504);
    expect(res.json().error).toBe("Upstream timeout");

    await app.close();
    await slow.close();
  });

  it("does not leak upstream error details to clients", async () => {
    const app = await buildTestApp({ PUBLIC_SERVICE_URL: await deadUpstreamUrl() });

    const res = await app.inject({ method: "GET", url: "/api/public/status" });
    expect(JSON.stringify(res.json())).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/);

    await app.close();
  });
});

describe("request limits", () => {
  it("rate limits a client after the configured maximum", async () => {
    const upstream = await startUpstream();
    const app = await buildTestApp({
      PUBLIC_SERVICE_URL: upstream.url,
      RATE_LIMIT_MAX: "3",
    });

    for (let i = 0; i < 3; i++) {
      const ok = await app.inject({ method: "GET", url: "/api/public/status" });
      expect(ok.statusCode).toBe(200);
    }

    const limited = await app.inject({ method: "GET", url: "/api/public/status" });
    expect(limited.statusCode).toBe(429);

    await app.close();
    await upstream.close();
  });

  it("bans a client after repeated over-limit requests", async () => {
    const upstream = await startUpstream();
    const app = await buildTestApp({
      PUBLIC_SERVICE_URL: upstream.url,
      RATE_LIMIT_MAX: "1",
      RATE_LIMIT_BAN: "1",
    });

    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({ method: "GET", url: "/api/public/status" });
      codes.push(res.statusCode);
    }

    // Over-limit requests are 429, then a ban returns 403.
    expect(codes).toContain(429);
    expect(codes).toContain(403);

    await app.close();
    await upstream.close();
  });

  it("exempts health checks from rate limiting", async () => {
    const app = await buildTestApp({ RATE_LIMIT_MAX: "2" });

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.statusCode).toBe(200);
    }

    await app.close();
  });

  it("streams large proxied bodies through without buffering them against the body limit", async () => {
    const upstream = await startUpstream();
    const app = await buildTestApp({
      PUBLIC_SERVICE_URL: upstream.url,
      BODY_LIMIT: "64",
    });

    const payload = { filler: "x".repeat(4096) };
    const res = await app.inject({
      method: "POST",
      url: "/api/public/echo",
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(upstream.requests.at(-1)?.body ?? "{}")).toEqual(payload);

    await app.close();
    await upstream.close();
  });
});
