import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "@test/helpers/app";

describe("gateway endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves liveness and readiness probes", async () => {
    const health = await app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });

    const ready = await app.inject({ method: "GET", url: "/readyz" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });
  });

  it("returns a uniform 404 with the request id", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe("Not found");
    expect(body.requestId).toBeTruthy();
  });

  it("sets security headers", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeTruthy();
  });

  it("echoes a generated request id on every response", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-correlation-id"]).toBe(res.headers["x-request-id"]);
  });

  it("honors a well-formed incoming x-request-id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": "client-id-123" },
    });
    expect(res.headers["x-request-id"]).toBe("client-id-123");
  });

  it("replaces an unsafe incoming x-request-id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": "bad id\nwith newline" },
    });
    expect(res.headers["x-request-id"]).not.toContain("\n");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("honors an incoming x-correlation-id independently of the request id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-correlation-id": "corr-abc" },
    });
    expect(res.headers["x-correlation-id"]).toBe("corr-abc");
    expect(res.headers["x-request-id"]).not.toBe("corr-abc");
  });

  it("allows any origin by default", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://example.com" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeTruthy();
  });
});

describe("CORS allow-list", () => {
  it("reflects only configured origins", async () => {
    const app = await buildTestApp({ CORS_ORIGINS: "https://allowed.example" });

    const allowed = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://allowed.example" },
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://allowed.example");

    const denied = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://denied.example" },
    });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();

    await app.close();
  });
});
