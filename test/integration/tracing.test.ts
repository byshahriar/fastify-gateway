import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "@test/helpers/app";
import { startUpstream, type TestUpstream } from "@test/helpers/upstream";

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

describe("trace propagation", () => {
  let app: FastifyInstance;
  let upstream: TestUpstream;

  beforeAll(async () => {
    upstream = await startUpstream();
    app = await buildTestApp({ PUBLIC_SERVICE_URL: upstream.url });
  });

  afterAll(async () => {
    await app.close();
    await upstream.close();
  });

  it("propagates request and correlation ids to the upstream", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/public/status",
      headers: { "x-request-id": "req-42", "x-correlation-id": "corr-42" },
    });
    expect(res.statusCode).toBe(200);

    const headers = upstream.requests.at(-1)?.headers;
    expect(headers?.["x-request-id"]).toBe("req-42");
    expect(headers?.["x-correlation-id"]).toBe("corr-42");
  });

  it("generates ids when the client sends none", async () => {
    await app.inject({ method: "GET", url: "/api/public/status" });

    const headers = upstream.requests.at(-1)?.headers;
    expect(headers?.["x-request-id"]).toBeTruthy();
    expect(headers?.["x-correlation-id"]).toBe(headers?.["x-request-id"]);
  });

  it("continues an incoming trace with the same trace id and a new span id", async () => {
    const incoming = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    await app.inject({
      method: "GET",
      url: "/api/public/status",
      headers: { traceparent: incoming },
    });

    const forwarded = upstream.requests.at(-1)?.headers.traceparent as string;
    const match = TRACEPARENT.exec(forwarded);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(match![2]).not.toBe("00f067aa0ba902b7");
    expect(match![3]).toBe("01");
  });

  it("starts a new trace when none is provided", async () => {
    await app.inject({ method: "GET", url: "/api/public/status" });

    const forwarded = upstream.requests.at(-1)?.headers.traceparent as string;
    expect(forwarded).toMatch(TRACEPARENT);
  });

  it("replaces an invalid incoming traceparent", async () => {
    await app.inject({
      method: "GET",
      url: "/api/public/status",
      headers: { traceparent: "00-invalid-espan-01" },
    });

    const forwarded = upstream.requests.at(-1)?.headers.traceparent as string;
    expect(forwarded).toMatch(TRACEPARENT);
    expect(forwarded).not.toContain("invalid");
  });
});
