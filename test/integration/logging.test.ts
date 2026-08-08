import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import loggingPlugin from "@/plugins/logging";
import type { GatewayConfig } from "@/types";
import { buildTestApp } from "@test/helpers/app";

const ENV_KEYS = ["LOG_REQUEST_STYLE"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/**
 * Builds a bare Fastify app with the logging plugin and a capture stream, so
 * tests can assert the exact lines the plugin emits.
 */
async function buildCapturingApp(config: Partial<GatewayConfig>, style?: string) {
  if (style !== undefined) process.env.LOG_REQUEST_STYLE = style;

  const lines: Array<Record<string, unknown>> = [];
  const app: FastifyInstance = Fastify({
    logger: {
      level: "info",
      stream: {
        write: (line: string) => {
          lines.push(JSON.parse(line) as Record<string, unknown>);
        },
      },
    },
    logController: new LogController({ disableRequestLogging: true }),
  });
  app.decorate("config", { SLOW_REQUEST_MS: 0, ...config } as GatewayConfig);
  await app.register(loggingPlugin);

  app.get("/instant", async () => ({ ok: true }));
  app.get("/slow", async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { ok: true };
  });

  await app.ready();
  return { app, lines };
}

describe("logging plugin", () => {
  it("emits one structured completion line per request in single style", async () => {
    const { app, lines } = await buildCapturingApp({}, "single");

    await app.inject({ method: "GET", url: "/instant?x=1" });
    await app.close();

    const completed = lines.filter((l) => l.msg === "request completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      method: "GET",
      url: "/instant?x=1",
      route: "/instant",
      statusCode: 200,
    });
    expect(typeof completed[0].elapsedMs).toBe("number");
  });

  it("logs nothing per request in off style", async () => {
    const { app, lines } = await buildCapturingApp({}, "off");

    await app.inject({ method: "GET", url: "/instant" });
    await app.close();

    expect(lines.filter((l) => l.msg === "request completed")).toHaveLength(0);
  });

  it("warns on requests slower than SLOW_REQUEST_MS", async () => {
    const { app, lines } = await buildCapturingApp({ SLOW_REQUEST_MS: 10 });

    await app.inject({ method: "GET", url: "/slow" });
    await app.inject({ method: "GET", url: "/instant" });
    await app.close();

    const slow = lines.filter((l) => l.msg === "slow request");
    expect(slow).toHaveLength(1);
    expect(slow[0]).toMatchObject({ route: "/slow", statusCode: 200 });
  });

  it("rejects an unknown LOG_REQUEST_STYLE at boot", async () => {
    await expect(buildTestApp({ LOG_REQUEST_STYLE: "verbose" })).rejects.toThrow(
      /Invalid LOG_REQUEST_STYLE/,
    );
  });

  it("builds and serves with single style end to end", async () => {
    const app = await buildTestApp({ LOG_REQUEST_STYLE: "single" });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
