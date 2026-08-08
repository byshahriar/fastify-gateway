import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createBearerAuthStrategy } from "@/strategies";

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

function fakeReq(token: string): FastifyRequest {
  return {
    headers: { authorization: `Bearer ${token}` },
    id: "req-1",
    log: { error: vi.fn() },
  } as unknown as FastifyRequest;
}

function fakeReply(): FastifyReply {
  const reply: Record<string, unknown> = {};
  reply.code = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  reply.header = vi.fn().mockReturnValue(reply);
  return reply as unknown as FastifyReply;
}

const activeResponse = () =>
  Promise.resolve(
    new Response('{"active":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

describe("bearer introspection cache bounds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("evicts the oldest entries at capacity instead of growing unboundedly", async () => {
    const fetchMock = vi.fn(activeResponse);
    vi.stubGlobal("fetch", fetchMock);

    const guard = createBearerAuthStrategy({
      introspectionUrl: "http://auth.internal/introspect",
      cacheTtlMs: 60_000,
      cacheMaxEntries: 2,
    }) as unknown as Guard;

    await guard(fakeReq("token-a"), fakeReply());
    await guard(fakeReq("token-b"), fakeReply());
    await guard(fakeReq("token-c"), fakeReply()); // at capacity: evicts token-a
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The two most recent tokens are cached decisions.
    await guard(fakeReq("token-b"), fakeReply());
    await guard(fakeReq("token-c"), fakeReply());
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The evicted token must be introspected again.
    await guard(fakeReq("token-a"), fakeReply());
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("sweeps expired entries at capacity so live decisions survive", async () => {
    const fetchMock = vi.fn(activeResponse);
    vi.stubGlobal("fetch", fetchMock);

    const guard = createBearerAuthStrategy({
      introspectionUrl: "http://auth.internal/introspect",
      cacheTtlMs: 30,
      cacheMaxEntries: 2,
    }) as unknown as Guard;

    await guard(fakeReq("stale-a"), fakeReply());
    await guard(fakeReq("stale-b"), fakeReply());
    await new Promise((resolve) => setTimeout(resolve, 60)); // both expire

    // Inserting at capacity sweeps the expired entries; the cache holds only
    // fresh decisions and repeated use of them stays cached.
    await guard(fakeReq("fresh-c"), fakeReply());
    await guard(fakeReq("fresh-c"), fakeReply());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
