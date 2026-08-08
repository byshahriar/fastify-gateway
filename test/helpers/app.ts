import type { FastifyInstance } from "fastify";
import { buildApp } from "@/app";

const BASE_ENV: Record<string, string> = {
  GATEWAY_API_KEY: "test-api-key",
  BASIC_AUTH_USERS: "admin:admin-secret",
  LOG_LEVEL: "silent",
  // Disable event-loop shedding by default: a busy CI worker could trip the
  // production thresholds mid-suite. Pressure tests opt back in explicitly.
  PRESSURE_MAX_EVENT_LOOP_DELAY_MS: "0",
  PRESSURE_MAX_EVENT_LOOP_UTILIZATION: "0",
};

/**
 * Builds a ready application with test-friendly env defaults. Overrides are
 * applied to `process.env` for the duration of the build and restored
 * afterwards (`@fastify/env` captures values at registration time).
 *
 * @param overrides - Env values to set; use an empty string to simulate an
 *   unset variable whose schema default is `""`.
 * @returns The ready Fastify instance.
 */
export async function buildTestApp(
  overrides: Record<string, string> = {},
): Promise<FastifyInstance> {
  const applied = { ...BASE_ENV, ...overrides };
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(applied)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    const app = await buildApp();
    await app.ready();
    return app;
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/**
 * Encodes credentials as an HTTP Basic `Authorization` header value.
 *
 * @param username - Basic auth username.
 * @param password - Basic auth password.
 * @returns The `Basic <base64>` header value.
 */
export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
