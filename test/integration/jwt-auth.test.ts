import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { ServiceGateway } from "@/core/service-gateway";
import { AuthScheme } from "@/enums";
import authPlugin from "@/plugins/auth";
import type { GatewayConfig } from "@/types";
import { startUpstream, type TestUpstream } from "@test/helpers/upstream";

const SECRET = "test-jwt-secret-that-is-long-enough-for-hs256";
const KEY = new TextEncoder().encode(SECRET);

function baseConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    GATEWAY_API_KEY: "",
    BASIC_AUTH_USERS: "",
    JWT_SECRET: "",
    JWT_JWKS_URI: "",
    JWT_ISSUER: "",
    JWT_AUDIENCE: "",
    UPSTREAM_TIMEOUT_MS: 1000,
    UPSTREAM_CONNECT_TIMEOUT_MS: 500,
    UPSTREAM_MAX_CONNECTIONS: 4,
    ...overrides,
  } as GatewayConfig;
}

class JwtGateway extends ServiceGateway {
  readonly name = "jwt-svc";
  readonly prefix = "/api/jwt";
  protected readonly auth = AuthScheme.Jwt;
  private readonly target: string;
  constructor(target: string) {
    super();
    this.target = target;
  }
  protected upstream() {
    return this.target;
  }
}

async function buildJwtApp(
  config: GatewayConfig,
  upstreamUrl: string,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("config", config);
  await app.register(authPlugin);
  await app.register(new JwtGateway(upstreamUrl).toPlugin());
  await app.ready();
  return app;
}

function sign(claims: Record<string, unknown> = {}, expiresIn = "5m") {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(KEY);
}

describe("jwt auth scheme", () => {
  let app: FastifyInstance;
  let upstream: TestUpstream;

  beforeAll(async () => {
    upstream = await startUpstream({ body: { service: "jwt" } });
    app = await buildJwtApp(baseConfig({ JWT_SECRET: SECRET }), upstream.url);
  });

  afterAll(async () => {
    await app.close();
    await upstream.close();
  });

  it("rejects a missing token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/jwt/data" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a malformed token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/jwt/data",
      headers: { authorization: "Bearer not.a.jwt" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("a-different-secret-value-entirely"));
    const res = await app.inject({
      method: "GET",
      url: "/api/jwt/data",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an expired token", async () => {
    const token = await sign({}, "-1m");
    const res = await app.inject({
      method: "GET",
      url: "/api/jwt/data",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a valid token and proxies", async () => {
    const token = await sign({ sub: "user-1" });
    const res = await app.inject({
      method: "GET",
      url: "/api/jwt/data",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ service: "jwt" });
  });

  it("rejects an unsecured 'alg: none' token", async () => {
    const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const unsecured = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "x" })}.`;
    const res = await app.inject({
      method: "GET",
      url: "/api/jwt/data",
      headers: { authorization: `Bearer ${unsecured}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("does not forward an unauthenticated request to the upstream", async () => {
    const before = upstream.requests.length;
    const res = await app.inject({ method: "GET", url: "/api/jwt/data" });
    expect(res.statusCode).toBe(401);
    expect(upstream.requests.length).toBe(before);
  });
});

describe("jwt claim enforcement", () => {
  it("rejects a token whose issuer/audience do not match", async () => {
    const upstream = await startUpstream();
    const app = await buildJwtApp(
      baseConfig({
        JWT_SECRET: SECRET,
        JWT_ISSUER: "https://issuer.example",
        JWT_AUDIENCE: "api",
      }),
      upstream.url,
    );

    const wrong = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://evil.example")
      .setAudience("api")
      .setExpirationTime("5m")
      .sign(KEY);
    const wrongRes = await app.inject({
      method: "GET",
      url: "/api/jwt/x",
      headers: { authorization: `Bearer ${wrong}` },
    });
    expect(wrongRes.statusCode).toBe(401);

    const right = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://issuer.example")
      .setAudience("api")
      .setExpirationTime("5m")
      .sign(KEY);
    const rightRes = await app.inject({
      method: "GET",
      url: "/api/jwt/x",
      headers: { authorization: `Bearer ${right}` },
    });
    expect(rightRes.statusCode).toBe(200);

    await app.close();
    await upstream.close();
  });
});

describe("jwt misconfiguration and JWKS", () => {
  it("returns 500 when neither secret nor JWKS is configured", async () => {
    const upstream = await startUpstream();
    const app = await buildJwtApp(baseConfig(), upstream.url);

    const token = await sign({});
    const res = await app.inject({
      method: "GET",
      url: "/api/jwt/x",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("Gateway misconfigured");

    await app.close();
    await upstream.close();
  });

  it("builds a JWKS-backed strategy from JWT_JWKS_URI", async () => {
    const upstream = await startUpstream();
    // A JWKS URI configures a remote key set; verification fetches lazily, so
    // an unreachable set simply yields 401 rather than a boot failure.
    const app = await buildJwtApp(
      baseConfig({ JWT_JWKS_URI: "http://127.0.0.1:1/jwks.json" }),
      upstream.url,
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/jwt/x",
      headers: { authorization: `Bearer ${await sign({})}` },
    });
    expect(res.statusCode).toBe(401);

    await app.close();
    await upstream.close();
  });
});
