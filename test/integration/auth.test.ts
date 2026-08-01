import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { basicAuthHeader, buildTestApp } from "@test/helpers/app";
import {
  startServiceUpstreams,
  startUpstream,
  type ServiceUpstreams,
} from "@test/helpers/upstream";

describe("edge authentication", () => {
  let app: FastifyInstance;
  let upstreams: ServiceUpstreams;

  beforeAll(async () => {
    upstreams = await startServiceUpstreams();
    app = await buildTestApp({
      ...upstreams.env,
      BASIC_AUTH_USERS: "admin:admin-secret,ci-bot:bot-pass",
    });
  });

  afterAll(async () => {
    await app.close();
    await upstreams.closeAll();
  });

  describe("api-key scheme", () => {
    it("rejects a missing key", async () => {
      const res = await app.inject({ method: "GET", url: "/api/users/me" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Unauthorized");
      expect(res.json().requestId).toBeTruthy();
    });

    it("rejects a wrong key", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: { "x-api-key": "wrong" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects a key differing only in case", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: { "x-api-key": "TEST-API-KEY" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("accepts the configured key and proxies", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: { "x-api-key": "test-api-key" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ service: "users" });
    });
  });

  describe("basic scheme", () => {
    it("rejects a missing Authorization header with a challenge", async () => {
      const res = await app.inject({ method: "GET", url: "/api/orders/list" });
      expect(res.statusCode).toBe(401);
      expect(res.headers["www-authenticate"]).toContain("Basic");
    });

    it("rejects a malformed Authorization header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/orders/list",
        headers: { authorization: "Basic not*base64*payload" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects a non-Basic scheme", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/orders/list",
        headers: { authorization: "Bearer some-token" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects an unknown user", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/orders/list",
        headers: { authorization: basicAuthHeader("ghost", "admin-secret") },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects a wrong password", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/orders/list",
        headers: { authorization: basicAuthHeader("admin", "wrong") },
      });
      expect(res.statusCode).toBe(401);
    });

    it("accepts valid credentials and proxies", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/orders/list",
        headers: { authorization: basicAuthHeader("admin", "admin-secret") },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ service: "orders" });
    });

    it("accepts every user in the configured list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/orders/list",
        headers: { authorization: basicAuthHeader("ci-bot", "bot-pass") },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("no auth scheme", () => {
    it("proxies without credentials", async () => {
      const res = await app.inject({ method: "GET", url: "/api/public/status" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ service: "public" });
    });
  });
});

describe("auth misconfiguration", () => {
  it("returns 500 when an api-key service is used without a configured key", async () => {
    const users = await startUpstream();
    const app = await buildTestApp({
      GATEWAY_API_KEY: "",
      USERS_SERVICE_URL: users.url,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: { "x-api-key": "anything" },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("Gateway misconfigured");

    await app.close();
    await users.close();
  });

  it("returns 500 when a basic service is used without configured users", async () => {
    const orders = await startUpstream();
    const app = await buildTestApp({
      BASIC_AUTH_USERS: "",
      ORDERS_SERVICE_URL: orders.url,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/orders/list",
      headers: { authorization: basicAuthHeader("admin", "admin-secret") },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("Gateway misconfigured");

    await app.close();
    await orders.close();
  });
});
