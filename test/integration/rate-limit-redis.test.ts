import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Replace the official @fastify/redis plugin (not our code to test) with a
// lightweight double that decorates `fastify.redis` with an in-memory
// ioredis-mock client and closes it on shutdown — mirroring the real plugin's
// observable behavior without a live Redis.
vi.mock("@fastify/redis", async () => {
  const fp = (await import("fastify-plugin")).default;
  const RedisMock = (await import("ioredis-mock")).default;
  return {
    default: fp(
      async (fastify, opts) => {
        const client = new RedisMock();
        fastify.decorate("redis", client as never);
        // Recorded so tests can assert the client options our plugin passes.
        fastify.decorate("redisPluginOptions", opts as never);
        fastify.addHook("onClose", async () => {
          await client.quit();
        });
      },
      { name: "@fastify/redis" },
    ),
  };
});

const { buildTestApp } = await import("@test/helpers/app");

describe("redis-backed rate limiting", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close().catch(() => {});
  });

  it("decorates a managed redis client and serves requests when REDIS_URL is set", async () => {
    app = await buildTestApp({ REDIS_URL: "redis://localhost:6379" });
    expect(app.redis).toBeDefined();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("handles a Redis store error without crashing", async () => {
    app = await buildTestApp({ REDIS_URL: "redis://localhost:6379" });
    // Without the plugin's error listener this would crash the process.
    expect(() => app.redis.emit("error", new Error("connection lost"))).not.toThrow();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("closes the managed client on shutdown", async () => {
    app = await buildTestApp({ REDIS_URL: "redis://localhost:6379" });
    const client = app.redis;
    await app.close();
    expect(client.status).not.toBe("ready");
  });

  it("uses the in-memory store when REDIS_URL is unset", async () => {
    app = await buildTestApp({ REDIS_URL: "" });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("disables the ioredis offline queue so an outage cannot queue commands unboundedly", async () => {
    app = await buildTestApp({ REDIS_URL: "redis://localhost:6379" });
    const opts = (app as unknown as { redisPluginOptions: Record<string, unknown> })
      .redisPluginOptions;
    expect(opts).toMatchObject({ enableOfflineQueue: false, maxRetriesPerRequest: null });
  });
});
