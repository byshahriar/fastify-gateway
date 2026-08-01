import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ServiceGateway } from "@/core/service-gateway";
import { AuthScheme } from "@/enums";
import authPlugin from "@/plugins/auth";
import type { GatewayConfig } from "@/types";
import { buildTestApp } from "@test/helpers/app";
import { startUpstream, type TestUpstream } from "@test/helpers/upstream";

const TEST_CONFIG = {
  GATEWAY_API_KEY: "",
  BASIC_AUTH_USERS: "",
  UPSTREAM_TIMEOUT_MS: 1_000,
  UPSTREAM_CONNECT_TIMEOUT_MS: 500,
  UPSTREAM_MAX_CONNECTIONS: 4,
} as GatewayConfig;

const CUSTOM_SCHEME = "token" as AuthScheme;

describe("auth strategy registry", () => {
  it("rejects duplicate registrations for a scheme", async () => {
    const app = await buildTestApp();
    expect(() => app.registerAuthStrategy(AuthScheme.ApiKey, async () => undefined)).toThrow(
      /already registered/,
    );
    await app.close();
  });

  it("fails at boot when a service references an unregistered scheme", async () => {
    class UnwiredGateway extends ServiceGateway {
      readonly name = "unwired";
      readonly prefix = "/api/unwired";
      protected readonly auth = CUSTOM_SCHEME;
      protected upstream() {
        return "http://127.0.0.1:9";
      }
    }

    const app = Fastify({ logger: false });
    app.decorate("config", TEST_CONFIG);
    app.register(authPlugin);
    app.register(new UnwiredGateway().toPlugin());

    await expect(app.ready()).rejects.toThrow(/No auth strategy registered .* "unwired"/);
    await app.close();
  });
});

describe("custom auth scheme (open for extension)", () => {
  let app: FastifyInstance;
  let upstream: TestUpstream;

  class TokenGateway extends ServiceGateway {
    readonly name = "token";
    readonly prefix = "/api/token";
    protected readonly auth = CUSTOM_SCHEME;
    protected upstream() {
      return upstream.url;
    }
  }

  beforeAll(async () => {
    upstream = await startUpstream({ body: { service: "token" } });

    app = Fastify({ logger: false });
    app.decorate("config", TEST_CONFIG);
    await app.register(authPlugin);

    app.registerAuthStrategy(CUSTOM_SCHEME, async (req, reply) => {
      if (req.headers["x-token"] !== "secret") {
        return reply.code(401).send({ error: "Unauthorized", requestId: req.id });
      }
    });

    await app.register(new TokenGateway().toPlugin());
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await upstream.close();
  });

  it("guards the service with the custom strategy", async () => {
    const res = await app.inject({ method: "GET", url: "/api/token/data" });
    expect(res.statusCode).toBe(401);
  });

  it("proxies when the custom strategy authorizes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/token/data",
      headers: { "x-token": "secret" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ service: "token" });
  });
});
