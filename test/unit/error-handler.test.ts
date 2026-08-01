import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import errorHandler from "@/plugins/error-handler";

function throwing(code?: string, statusCode?: number, message = "boom") {
  return async () => {
    const err = new Error(message) as Error & { code?: string; statusCode?: number };
    err.code = code;
    err.statusCode = statusCode;
    throw err;
  };
}

describe("error-handler status mapping", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandler);

    app.get("/headers-timeout", throwing("UND_ERR_HEADERS_TIMEOUT"));
    app.get("/body-timeout", throwing("UND_ERR_BODY_TIMEOUT"));
    app.get("/etimedout", throwing("ETIMEDOUT"));
    app.get("/refused", throwing("ECONNREFUSED"));
    app.get("/reset", throwing("ECONNRESET"));
    app.get("/dns", throwing("ENOTFOUND"));
    app.get(
      "/wrapped-timeout",
      throwing("FST_REPLY_FROM_INTERNAL_SERVER_ERROR", 500, "Connect Timeout Error"),
    );
    app.get(
      "/wrapped-refused",
      throwing("FST_REPLY_FROM_INTERNAL_SERVER_ERROR", 500, "connect ECONNREFUSED 127.0.0.1:1"),
    );
    app.get("/unavailable", throwing(undefined, 503));
    app.get("/client-error", throwing(undefined, 400, "Bad input"));
    app.get("/plain", throwing());

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const cases: Array<[string, number, string]> = [
    ["/headers-timeout", 504, "Upstream timeout"],
    ["/body-timeout", 504, "Upstream timeout"],
    ["/etimedout", 504, "Upstream timeout"],
    ["/refused", 502, "Upstream unavailable"],
    ["/reset", 502, "Upstream unavailable"],
    ["/dns", 502, "Upstream unavailable"],
    ["/wrapped-timeout", 504, "Upstream timeout"],
    ["/wrapped-refused", 502, "Upstream unavailable"],
    ["/unavailable", 503, "Upstream unavailable"],
    ["/client-error", 400, "Bad input"],
    ["/plain", 500, "Internal gateway error"],
  ];

  it.each(cases)("%s maps to %d %s", async (url, status, message) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).toBe(status);
    const body = res.json();
    expect(body.error).toBe(message);
    expect(body.requestId).toBeTruthy();
  });

  it("never includes the original 5xx message in the response", async () => {
    const res = await app.inject({ method: "GET", url: "/wrapped-refused" });
    expect(JSON.stringify(res.json())).not.toContain("127.0.0.1");
  });
});
