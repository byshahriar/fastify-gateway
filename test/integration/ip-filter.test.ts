import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "@test/helpers/app";
import { startServiceUpstreams, type ServiceUpstreams } from "@test/helpers/upstream";

describe("ip filtering", () => {
  let app: FastifyInstance;
  let upstreams: ServiceUpstreams | undefined;

  afterEach(async () => {
    await app.close().catch(() => {});
    await upstreams?.closeAll().catch(() => {});
    upstreams = undefined;
  });

  it("blocks a client on the deny list with the uniform 403 body", async () => {
    app = await buildTestApp({ IP_DENY_LIST: "127.0.0.1" });

    const res = await app.inject({ method: "GET", url: "/api/public/data" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "Forbidden" });
    expect(res.json().requestId).toBeTruthy();
  });

  it("blocks clients outside a non-empty allow list", async () => {
    app = await buildTestApp({ IP_ALLOW_LIST: "10.0.0.0/8" });

    const blocked = await app.inject({ method: "GET", url: "/api/public/data" });
    expect(blocked.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "GET",
      url: "/readyz",
      remoteAddress: "10.1.2.3",
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("lets allow-listed clients through to upstreams (CIDR match)", async () => {
    upstreams = await startServiceUpstreams();
    app = await buildTestApp({ ...upstreams.env, IP_ALLOW_LIST: "127.0.0.0/8" });

    const res = await app.inject({ method: "GET", url: "/api/public/data" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ service: "public" });
  });

  it("deny wins over allow", async () => {
    app = await buildTestApp({ IP_ALLOW_LIST: "127.0.0.0/8", IP_DENY_LIST: "127.0.0.1" });

    const res = await app.inject({ method: "GET", url: "/api/public/data" });
    expect(res.statusCode).toBe(403);
  });

  it("never blocks health probes", async () => {
    app = await buildTestApp({ IP_DENY_LIST: "127.0.0.1" });

    const live = await app.inject({ method: "GET", url: "/healthz" });
    expect(live.statusCode).toBe(200);

    const ready = await app.inject({ method: "GET", url: "/readyz" });
    expect(ready.statusCode).toBe(200);
  });

  it("still filters /metrics", async () => {
    app = await buildTestApp({ IP_DENY_LIST: "127.0.0.1" });

    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(403);
  });

  it("matches IPv4-mapped IPv6 clients against IPv4 entries", async () => {
    app = await buildTestApp({ IP_DENY_LIST: "192.0.2.7" });

    const res = await app.inject({
      method: "GET",
      url: "/api/public/data",
      remoteAddress: "::ffff:192.0.2.7",
    });
    expect(res.statusCode).toBe(403);
  });

  it("fails at boot on an invalid list entry", async () => {
    await expect(buildTestApp({ IP_DENY_LIST: "not-an-ip" })).rejects.toThrow(
      /Invalid IP list entry/,
    );
  });
});
