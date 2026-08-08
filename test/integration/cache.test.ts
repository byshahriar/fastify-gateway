import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

// Replace the official @fastify/redis plugin (not our code to test) with a
// lightweight double that decorates `fastify.redis` with an in-memory
// ioredis-mock client and closes it on shutdown — mirroring the real plugin's
// observable behavior without a live Redis.
vi.mock("@fastify/redis", async () => {
  const fp = (await import("fastify-plugin")).default;
  const RedisMock = (await import("ioredis-mock")).default;
  return {
    default: fp(
      async (fastify) => {
        const client = new RedisMock();
        fastify.decorate("redis", client as never);
        fastify.addHook("onClose", async () => {
          await client.quit();
        });
      },
      { name: "@fastify/redis" },
    ),
  };
});

const { ServiceGateway } = await import("@/core/service-gateway");
const { AuthScheme } = await import("@/enums");
const authPlugin = (await import("@/plugins/auth")).default;
const { buildTestApp } = await import("@test/helpers/app");
const { startUpstream } = await import("@test/helpers/upstream");
import type { GatewayConfig } from "@/types";
import type { TestUpstream } from "@test/helpers/upstream";

const CACHE_ENV = { REDIS_URL: "redis://localhost:6379", CACHE_ENABLED: "true" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("response caching", () => {
  let app: FastifyInstance;
  let upstream: TestUpstream | undefined;

  afterEach(async () => {
    await app?.close().catch(() => {});
    await upstream?.close().catch(() => {});
    upstream = undefined;
  });

  it("serves the second request from cache when the upstream allows caching", async () => {
    upstream = await startUpstream({
      body: { service: "public" },
      headers: { "cache-control": "public, max-age=60" },
    });
    app = await buildTestApp({ ...CACHE_ENV, PUBLIC_SERVICE_URL: upstream.url });

    const miss = await app.inject({ method: "GET", url: "/api/public/items" });
    expect(miss.statusCode).toBe(200);
    expect(miss.headers["x-cache"]).toBe("MISS");

    await sleep(50); // The store is fire-and-forget after the response ends.

    const hit = await app.inject({ method: "GET", url: "/api/public/items" });
    expect(hit.statusCode).toBe(200);
    expect(hit.headers["x-cache"]).toBe("HIT");
    expect(hit.headers["content-type"]).toContain("application/json");
    expect(hit.json()).toEqual({ service: "public" });
    expect(upstream.requests).toHaveLength(1);
  });

  it("does not cache when the upstream sends no Cache-Control", async () => {
    upstream = await startUpstream({ body: { service: "public" } });
    app = await buildTestApp({ ...CACHE_ENV, PUBLIC_SERVICE_URL: upstream.url });

    await app.inject({ method: "GET", url: "/api/public/plain" });
    await sleep(50);
    const second = await app.inject({ method: "GET", url: "/api/public/plain" });

    expect(second.headers["x-cache"]).toBe("MISS");
    expect(upstream.requests).toHaveLength(2);
  });

  it("respects an upstream no-store directive", async () => {
    upstream = await startUpstream({
      body: { secret: true },
      headers: { "cache-control": "no-store" },
    });
    app = await buildTestApp({ ...CACHE_ENV, PUBLIC_SERVICE_URL: upstream.url });

    await app.inject({ method: "GET", url: "/api/public/no-store" });
    await sleep(50);
    const second = await app.inject({ method: "GET", url: "/api/public/no-store" });

    expect(second.headers["x-cache"]).toBe("MISS");
    expect(upstream.requests).toHaveLength(2);
  });

  it("revalidates on a client no-cache request", async () => {
    upstream = await startUpstream({
      body: { service: "public" },
      headers: { "cache-control": "max-age=60" },
    });
    app = await buildTestApp({ ...CACHE_ENV, PUBLIC_SERVICE_URL: upstream.url });

    await app.inject({ method: "GET", url: "/api/public/reval" });
    await sleep(50);

    const revalidated = await app.inject({
      method: "GET",
      url: "/api/public/reval",
      headers: { "cache-control": "no-cache" },
    });
    expect(revalidated.headers["x-cache"]).toBe("MISS");
    expect(upstream.requests).toHaveLength(2);
  });

  it("bypasses the cache for credentialed requests", async () => {
    upstream = await startUpstream({
      body: { service: "public" },
      headers: { "cache-control": "max-age=60" },
    });
    app = await buildTestApp({ ...CACHE_ENV, PUBLIC_SERVICE_URL: upstream.url });

    const authed = { authorization: "Bearer some-user-token" };
    const first = await app.inject({ method: "GET", url: "/api/public/me", headers: authed });
    await sleep(50);
    const second = await app.inject({ method: "GET", url: "/api/public/me", headers: authed });

    expect(first.headers["x-cache"]).toBeUndefined();
    expect(second.headers["x-cache"]).toBeUndefined();
    expect(upstream.requests).toHaveLength(2);
  });

  it("never caches non-GET requests", async () => {
    upstream = await startUpstream({
      body: { created: true },
      headers: { "cache-control": "max-age=60" },
    });
    app = await buildTestApp({ ...CACHE_ENV, PUBLIC_SERVICE_URL: upstream.url });

    const first = await app.inject({ method: "POST", url: "/api/public/things", payload: {} });
    await sleep(50);
    await app.inject({ method: "POST", url: "/api/public/things", payload: {} });

    expect(first.headers["x-cache"]).toBeUndefined();
    expect(upstream.requests).toHaveLength(2);
  });

  it("fails at boot when CACHE_ENABLED is set without REDIS_URL", async () => {
    await expect(buildTestApp({ CACHE_ENABLED: "true", REDIS_URL: "" })).rejects.toThrow(
      /REDIS_URL/,
    );
  });

  it("fails at boot when a service combines caching with edge auth", async () => {
    class CachedSecureGateway extends ServiceGateway {
      readonly name = "cached-secure";
      readonly prefix = "/api/cached-secure";
      protected readonly auth = AuthScheme.ApiKey;
      protected readonly cacheable = true;
      protected upstream() {
        return "http://127.0.0.1:9";
      }
    }

    const bare = Fastify({ logger: false });
    bare.decorate("config", { GATEWAY_API_KEY: "k", BASIC_AUTH_USERS: "" } as GatewayConfig);
    bare.register(authPlugin);
    bare.register(new CachedSecureGateway().toPlugin());

    await expect(bare.ready()).rejects.toThrow(/cannot combine caching with edge auth/);
    await bare.close();
  });
});
