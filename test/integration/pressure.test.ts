import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "@test/helpers/app";
import { startServiceUpstreams, type ServiceUpstreams } from "@test/helpers/upstream";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("load shedding under pressure", () => {
  let app: FastifyInstance;
  let upstreams: ServiceUpstreams | undefined;

  afterEach(async () => {
    await app.close().catch(() => {});
    await upstreams?.closeAll().catch(() => {});
    upstreams = undefined;
  });

  it("sheds proxied requests but keeps probes and metrics responsive", async () => {
    upstreams = await startServiceUpstreams();
    // A 1-byte heap threshold is always exceeded after the first sample.
    app = await buildTestApp({
      ...upstreams.env,
      PRESSURE_MAX_HEAP_USED_BYTES: "1",
      PRESSURE_SAMPLE_INTERVAL_MS: "5",
    });
    await sleep(100);

    const shed = await app.inject({ method: "GET", url: "/api/public/data" });
    expect(shed.statusCode).toBe(503);
    expect(shed.headers["retry-after"]).toBe("10");
    expect(shed.json()).toMatchObject({ error: "Gateway overloaded" });
    expect(upstreams.publicSvc.requests).toHaveLength(0);

    const live = await app.inject({ method: "GET", url: "/healthz" });
    expect(live.statusCode).toBe(200);

    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    expect(metrics.statusCode).toBe(200);
  });

  it("reports pressure on the readiness probe", async () => {
    app = await buildTestApp({
      PRESSURE_MAX_HEAP_USED_BYTES: "1",
      PRESSURE_SAMPLE_INTERVAL_MS: "5",
    });
    await sleep(100);

    const ready = await app.inject({ method: "GET", url: "/readyz" });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: "under-pressure" });
  });

  it("serves normally when no threshold is exceeded", async () => {
    upstreams = await startServiceUpstreams();
    app = await buildTestApp(upstreams.env);

    const ready = await app.inject({ method: "GET", url: "/readyz" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });

    const proxied = await app.inject({ method: "GET", url: "/api/public/data" });
    expect(proxied.statusCode).toBe(200);
    expect(proxied.headers["retry-after"]).toBeUndefined();
  });
});
