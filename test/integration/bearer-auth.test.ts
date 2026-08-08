import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ServiceGateway } from "@/core/service-gateway";
import { AuthScheme } from "@/enums";
import authPlugin from "@/plugins/auth";
import type { GatewayConfig } from "@/types";
import { deadUpstreamUrl, startUpstream } from "@test/helpers/upstream";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((fn) => fn()));
});

class ProtectedApi extends ServiceGateway {
  readonly name = "protected";
  readonly prefix = "/api";
  protected readonly auth = AuthScheme.Bearer;
  private readonly target: string;
  constructor(target: string) {
    super();
    this.target = target;
  }
  protected upstream() {
    return this.target;
  }
}

async function buildGateway(overrides: Partial<GatewayConfig>, upstreamUrl: string) {
  const config = {
    GATEWAY_API_KEY: "",
    BASIC_AUTH_USERS: "",
    JWT_SECRET: "",
    JWT_JWKS_URI: "",
    JWT_ISSUER: "",
    JWT_AUDIENCE: "",
    BEARER_INTROSPECTION_URL: "",
    BEARER_INTROSPECTION_TOKEN: "",
    BEARER_CACHE_TTL_MS: 0,
    UPSTREAM_TIMEOUT_MS: 1000,
    UPSTREAM_CONNECT_TIMEOUT_MS: 500,
    UPSTREAM_MAX_CONNECTIONS: 4,
    ...overrides,
  } as GatewayConfig;

  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate("config", config);
  await app.register(authPlugin);
  await app.register(new ProtectedApi(upstreamUrl).toPlugin());
  await app.ready();
  cleanup.push(() => app.close());
  return app;
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("bearer auth strategy", () => {
  it("proxies when introspection reports the token active", async () => {
    const introspection = await startUpstream({ body: { active: true } });
    const resource = await startUpstream({ body: { data: "ok" } });
    cleanup.push(
      () => introspection.close(),
      () => resource.close(),
    );

    const app = await buildGateway(
      { BEARER_INTROSPECTION_URL: introspection.url },
      resource.url,
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/x",
      headers: bearer("some-token"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: "ok" });
    expect(JSON.parse(introspection.requests.at(-1)!.body)).toEqual({ token: "some-token" });
  });

  it("rejects when introspection reports the token inactive, without reaching the upstream", async () => {
    const introspection = await startUpstream({ body: { active: false } });
    const resource = await startUpstream();
    cleanup.push(
      () => introspection.close(),
      () => resource.close(),
    );

    const app = await buildGateway(
      { BEARER_INTROSPECTION_URL: introspection.url },
      resource.url,
    );
    const res = await app.inject({ method: "GET", url: "/api/x", headers: bearer("t") });
    expect(res.statusCode).toBe(401);
    expect(resource.requests).toHaveLength(0);
  });

  it("rejects when the introspection response is not valid JSON", async () => {
    const introspection = await startUpstream({ body: "{ not json" });
    const resource = await startUpstream();
    cleanup.push(
      () => introspection.close(),
      () => resource.close(),
    );

    const app = await buildGateway(
      { BEARER_INTROSPECTION_URL: introspection.url },
      resource.url,
    );
    const res = await app.inject({ method: "GET", url: "/api/x", headers: bearer("t") });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a request with no token", async () => {
    const introspection = await startUpstream({ body: { active: true } });
    const resource = await startUpstream();
    cleanup.push(
      () => introspection.close(),
      () => resource.close(),
    );

    const app = await buildGateway(
      { BEARER_INTROSPECTION_URL: introspection.url },
      resource.url,
    );
    const res = await app.inject({ method: "GET", url: "/api/x" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects when the introspection endpoint returns a non-2xx", async () => {
    const introspection = await startUpstream({ status: 500, body: {} });
    const resource = await startUpstream();
    cleanup.push(
      () => introspection.close(),
      () => resource.close(),
    );

    const app = await buildGateway(
      { BEARER_INTROSPECTION_URL: introspection.url },
      resource.url,
    );
    const res = await app.inject({ method: "GET", url: "/api/x", headers: bearer("t") });
    expect(res.statusCode).toBe(401);
  });

  it("fails closed when the auth service is unreachable", async () => {
    const resource = await startUpstream();
    cleanup.push(() => resource.close());

    const app = await buildGateway(
      { BEARER_INTROSPECTION_URL: await deadUpstreamUrl() },
      resource.url,
    );
    const res = await app.inject({ method: "GET", url: "/api/x", headers: bearer("t") });
    expect(res.statusCode).toBe(401);
  });

  it("returns 500 when BEARER_INTROSPECTION_URL is unset", async () => {
    const resource = await startUpstream();
    cleanup.push(() => resource.close());

    const app = await buildGateway({}, resource.url);
    const res = await app.inject({ method: "GET", url: "/api/x", headers: bearer("t") });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("Gateway misconfigured");
  });

  it("authenticates the gateway to the introspection endpoint with BEARER_INTROSPECTION_TOKEN", async () => {
    const introspection = await startUpstream({ body: { active: true } });
    const resource = await startUpstream({ body: { data: "ok" } });
    cleanup.push(
      () => introspection.close(),
      () => resource.close(),
    );

    const app = await buildGateway(
      { BEARER_INTROSPECTION_URL: introspection.url, BEARER_INTROSPECTION_TOKEN: "gw-secret" },
      resource.url,
    );
    await app.inject({ method: "GET", url: "/api/x", headers: bearer("t") });

    expect(introspection.requests.at(-1)!.headers.authorization).toBe("Bearer gw-secret");
  });

  it("caches an active token and skips introspection within the TTL", async () => {
    const introspection = await startUpstream({ body: { active: true } });
    const resource = await startUpstream({ body: { data: "ok" } });
    cleanup.push(
      () => introspection.close(),
      () => resource.close(),
    );

    const app = await buildGateway(
      { BEARER_INTROSPECTION_URL: introspection.url, BEARER_CACHE_TTL_MS: 60_000 },
      resource.url,
    );

    const first = await app.inject({ method: "GET", url: "/api/x", headers: bearer("tok") });
    const second = await app.inject({ method: "GET", url: "/api/y", headers: bearer("tok") });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    // The second request is served from cache — introspection ran only once.
    expect(introspection.requests).toHaveLength(1);
  });

  it("re-introspects once a cached decision expires", async () => {
    const introspection = await startUpstream({ body: { active: true } });
    const resource = await startUpstream({ body: { data: "ok" } });
    cleanup.push(
      () => introspection.close(),
      () => resource.close(),
    );

    const app = await buildGateway(
      { BEARER_INTROSPECTION_URL: introspection.url, BEARER_CACHE_TTL_MS: 40 },
      resource.url,
    );

    await app.inject({ method: "GET", url: "/api/x", headers: bearer("tok") });
    await new Promise((resolve) => setTimeout(resolve, 90));
    const afterExpiry = await app.inject({
      method: "GET",
      url: "/api/x",
      headers: bearer("tok"),
    });

    expect(afterExpiry.statusCode).toBe(200);
    expect(introspection.requests).toHaveLength(2);
  });

  it("does not cache an inactive token", async () => {
    const introspection = await startUpstream({ body: { active: false } });
    const resource = await startUpstream();
    cleanup.push(
      () => introspection.close(),
      () => resource.close(),
    );

    const app = await buildGateway(
      { BEARER_INTROSPECTION_URL: introspection.url, BEARER_CACHE_TTL_MS: 60_000 },
      resource.url,
    );

    const first = await app.inject({ method: "GET", url: "/api/x", headers: bearer("tok") });
    const second = await app.inject({ method: "GET", url: "/api/x", headers: bearer("tok") });

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(401);
    // A rejected token is never cached, so each attempt re-introspects.
    expect(introspection.requests).toHaveLength(2);
  });
});
