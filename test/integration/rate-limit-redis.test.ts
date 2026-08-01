import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Track every Redis instance the plugin creates so the test can drive the
// error listener and confirm the client is torn down.
const created: Array<{ emit: (event: string, ...args: unknown[]) => boolean; status: string }> =
  [];

vi.mock("ioredis", async () => {
  const mod = (await import("ioredis-mock")) as unknown as {
    default: new (...a: unknown[]) => object;
  };
  const RedisMock = mod.default;
  class Tracked extends RedisMock {
    constructor(...args: unknown[]) {
      super(...args);
      created.push(this as never);
    }
  }
  return { Redis: Tracked, default: Tracked };
});

// Imported after the mock is registered (vi.mock is hoisted).
const { buildTestApp } = await import("@test/helpers/app");

describe("redis-backed rate limiting", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    created.length = 0;
    app = await buildTestApp({ REDIS_URL: "redis://localhost:6379" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("selects the Redis store when REDIS_URL is set", () => {
    expect(created).toHaveLength(1);
  });

  it("serves requests with the Redis store configured", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("handles a Redis store error without crashing", async () => {
    // Emitting 'error' would crash the process if the plugin had no listener.
    expect(() => created[0].emit("error", new Error("connection lost"))).not.toThrow();

    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("disconnects the client on shutdown", async () => {
    await app.close();
    expect(created[0].status).not.toBe("ready");
  });
});
