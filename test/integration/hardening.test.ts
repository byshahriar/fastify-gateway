import { describe, expect, it } from "vitest";
import { buildTestApp } from "@test/helpers/app";
import { startUpstream } from "@test/helpers/upstream";

describe("configuration guards", () => {
  it("refuses to start with wildcard CORS origins and credentials enabled", async () => {
    await expect(
      buildTestApp({ CORS_ORIGINS: "*", CORS_ALLOW_CREDENTIALS: "true" }),
    ).rejects.toThrow(/CORS_ALLOW_CREDENTIALS.*wildcard/);
  });

  it("allows credentials with an explicit origin allow-list", async () => {
    const app = await buildTestApp({
      CORS_ORIGINS: "https://app.example.com",
      CORS_ALLOW_CREDENTIALS: "true",
    });
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://app.example.com" },
    });
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    await app.close();
  });

  it("refuses to start on a non-URL service address", async () => {
    await expect(buildTestApp({ USERS_SERVICE_URL: "not-a-url" })).rejects.toThrow();
  });

  it("refuses to start on duplicate Basic auth usernames", async () => {
    await expect(buildTestApp({ BASIC_AUTH_USERS: "admin:one,admin:two" })).rejects.toThrow(
      /Duplicate username/,
    );
  });

  it("boots with proxy trust disabled", async () => {
    const app = await buildTestApp({ TRUST_PROXY: "false" });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("refuses to start on a non-numeric factory option instead of disabling it", async () => {
    // A bad REQUEST_TIMEOUT_MS would otherwise coerce to NaN and Fastify would
    // silently accept it as 0, disabling the slow-client timeout.
    await expect(buildTestApp({ REQUEST_TIMEOUT_MS: "abc" })).rejects.toThrow(
      /REQUEST_TIMEOUT_MS/,
    );
  });

  it("refuses to start on an invalid TRUST_PROXY value", async () => {
    await expect(buildTestApp({ TRUST_PROXY: "yes" })).rejects.toThrow(/TRUST_PROXY/);
  });
});

describe("correlation id hardening", () => {
  it("replaces an unsafe incoming x-correlation-id", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-correlation-id": "bad id with spaces!" },
    });
    expect(res.headers["x-correlation-id"]).not.toContain(" ");
    expect(res.headers["x-correlation-id"]).toBe(res.headers["x-request-id"]);
    await app.close();
  });
});

describe("readiness during shutdown", () => {
  it("reports draining once shutdown has begun", async () => {
    const app = await buildTestApp();

    const ready = await app.inject({ method: "GET", url: "/readyz" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });

    app.shuttingDown = true;
    const draining = await app.inject({ method: "GET", url: "/readyz" });
    expect(draining.statusCode).toBe(503);
    expect(draining.json()).toEqual({ status: "draining" });

    await app.close();
  });
});

describe("metrics", () => {
  it("exposes request counters with route-pattern labels", async () => {
    const upstream = await startUpstream();
    const app = await buildTestApp({ PUBLIC_SERVICE_URL: upstream.url });

    await app.inject({ method: "GET", url: "/healthz" });
    await app.inject({ method: "GET", url: "/api/public/some/deep/path" });

    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");

    const body = res.body;
    expect(body).toContain("http_requests_total");
    expect(body).toContain("http_request_duration_seconds");
    expect(body).toContain('route="/healthz"');
    // Proxied requests are labeled by route pattern, never the raw URL.
    expect(body).not.toContain("some/deep/path");

    await app.close();
    await upstream.close();
  });
});

describe("metrics endpoint auth", () => {
  it("is open when no token is configured", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("requires a bearer token when configured", async () => {
    const app = await buildTestApp({ METRICS_TOKEN: "scrape-secret" });

    const noAuth = await app.inject({ method: "GET", url: "/metrics" });
    expect(noAuth.statusCode).toBe(401);

    const wrong = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer nope" },
    });
    expect(wrong.statusCode).toBe(401);

    const ok = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer scrape-secret" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain("http_requests_total");

    await app.close();
  });
});

describe("forwarded-for handling", () => {
  it("replaces a client-supplied x-forwarded-for when the proxy is untrusted", async () => {
    const upstream = await startUpstream();
    const app = await buildTestApp({ TRUST_PROXY: "false", PUBLIC_SERVICE_URL: upstream.url });

    await app.inject({
      method: "GET",
      url: "/api/public/status",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const forwarded = upstream.requests.at(-1)?.headers["x-forwarded-for"];
    expect(forwarded).not.toContain("1.2.3.4");

    await app.close();
    await upstream.close();
  });
});

describe("tracestate propagation", () => {
  it("keeps tracestate alongside a continued trace", async () => {
    const upstream = await startUpstream();
    const app = await buildTestApp({ PUBLIC_SERVICE_URL: upstream.url });

    await app.inject({
      method: "GET",
      url: "/api/public/status",
      headers: {
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: "vendor=abc123",
      },
    });

    expect(upstream.requests.at(-1)?.headers.tracestate).toBe("vendor=abc123");
    await app.close();
    await upstream.close();
  });

  it("drops tracestate when a new trace is started", async () => {
    const upstream = await startUpstream();
    const app = await buildTestApp({ PUBLIC_SERVICE_URL: upstream.url });

    await app.inject({
      method: "GET",
      url: "/api/public/status",
      headers: { tracestate: "vendor=orphaned" },
    });

    expect(upstream.requests.at(-1)?.headers.tracestate).toBeUndefined();
    await app.close();
    await upstream.close();
  });
});

describe("metrics label cardinality", () => {
  it("folds non-standard HTTP methods to OTHER", async () => {
    const app = await buildTestApp();
    // Non-standard method — cast past the typed HTTP verbs to reach the label
    // folding path.
    await app.inject({ method: "PROPFIND" as "GET", url: "/healthz" });

    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.body).toContain('method="OTHER"');
    expect(res.body).not.toContain('method="PROPFIND"');

    await app.close();
  });
});
