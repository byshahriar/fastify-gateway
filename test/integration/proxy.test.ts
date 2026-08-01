import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { basicAuthHeader, buildTestApp } from "@test/helpers/app";
import {
  startServiceUpstreams,
  startUpstream,
  type ServiceUpstreams,
  type TestUpstream,
} from "@test/helpers/upstream";

describe("proxying", () => {
  let app: FastifyInstance;
  let users: TestUpstream;
  let orders: TestUpstream;
  let publicSvc: TestUpstream;
  let upstreams: ServiceUpstreams;

  beforeAll(async () => {
    upstreams = await startServiceUpstreams();
    ({ users, orders, publicSvc } = upstreams);

    app = await buildTestApp({
      ...upstreams.env,
      USERS_SERVICE_BASIC_AUTH: "gateway-svc:s2s-secret",
      ORDERS_SERVICE_BASIC_AUTH: "gateway-svc:s2s-orders",
    });
  });

  afterAll(async () => {
    await app.close();
    await upstreams.closeAll();
  });

  it("strips the public prefix from the upstream path", async () => {
    await app.inject({ method: "GET", url: "/api/public/status" });
    expect(publicSvc.requests.at(-1)?.url).toBe("/status");
  });

  it("preserves nested paths and query strings", async () => {
    await app.inject({ method: "GET", url: "/api/public/v2/items?page=3&sort=asc" });
    expect(publicSvc.requests.at(-1)?.url).toBe("/v2/items?page=3&sort=asc");
  });

  it("forwards the request method and body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/public/echo",
      payload: { hello: "world" },
    });
    expect(res.statusCode).toBe(200);

    const captured = publicSvc.requests.at(-1);
    expect(captured?.method).toBe("POST");
    expect(JSON.parse(captured?.body ?? "{}")).toEqual({ hello: "world" });
  });

  it("passes through the upstream status and body", async () => {
    const teapot = await startUpstream({ status: 418, body: { short: "stout" } });
    const teapotApp = await buildTestApp({ PUBLIC_SERVICE_URL: teapot.url });

    const res = await teapotApp.inject({ method: "GET", url: "/api/public/brew" });
    expect(res.statusCode).toBe(418);
    expect(res.json()).toEqual({ short: "stout" });

    await teapotApp.close();
    await teapot.close();
  });

  it("adds x-forwarded-* headers", async () => {
    await app.inject({
      method: "GET",
      url: "/api/public/status",
      headers: { host: "gateway.example" },
    });

    const headers = publicSvc.requests.at(-1)?.headers;
    expect(headers?.["x-forwarded-for"]).toBeTruthy();
    expect(headers?.["x-forwarded-host"]).toBe("gateway.example");
    expect(headers?.["x-forwarded-proto"]).toBe("http");
  });

  it("appends the gateway's peer to an existing x-forwarded-for chain", async () => {
    await app.inject({
      method: "GET",
      url: "/api/public/status",
      remoteAddress: "10.9.9.9",
      headers: { "x-forwarded-for": "203.0.113.9" },
    });

    const headers = publicSvc.requests.at(-1)?.headers;
    expect(headers?.["x-forwarded-for"]).toBe("203.0.113.9, 10.9.9.9");
  });

  it("never forwards the gateway API key upstream", async () => {
    await app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: { "x-api-key": "test-api-key" },
    });

    const headers = users.requests.at(-1)?.headers;
    expect(headers?.["x-api-key"]).toBeUndefined();
  });

  it("replaces client basic credentials with the upstream service credentials", async () => {
    await app.inject({
      method: "GET",
      url: "/api/orders/list",
      headers: { authorization: basicAuthHeader("admin", "admin-secret") },
    });

    const headers = orders.requests.at(-1)?.headers;
    expect(headers?.authorization).toBe(basicAuthHeader("gateway-svc", "s2s-orders"));
  });

  it("injects upstream credentials on api-key services too", async () => {
    await app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: { "x-api-key": "test-api-key" },
    });

    const headers = users.requests.at(-1)?.headers;
    expect(headers?.authorization).toBe(basicAuthHeader("gateway-svc", "s2s-secret"));
  });

  it("passes a client Authorization header through when no upstream credentials are set", async () => {
    await app.inject({
      method: "GET",
      url: "/api/public/status",
      headers: { authorization: "Bearer client-token" },
    });

    const headers = publicSvc.requests.at(-1)?.headers;
    expect(headers?.authorization).toBe("Bearer client-token");
  });
});
