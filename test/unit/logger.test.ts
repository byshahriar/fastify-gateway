import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildLoggerOptions } from "@/config/logger";

const KEYS = [
  "LOG_LEVEL",
  "LOG_DESTINATION",
  "LOG_FILE",
  "LOG_ROTATION_FREQUENCY",
  "LOG_ROTATION_MAX_SIZE",
  "LOG_RETENTION_FILES",
];

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("buildLoggerOptions", () => {
  it("defaults to the console channel (no transport)", () => {
    const options = buildLoggerOptions();
    expect(options.transport).toBeUndefined();
    expect(options.level).toBe("info");
  });

  it("uses a standard format: ISO timestamps and level labels", () => {
    const options = buildLoggerOptions();
    expect(typeof options.timestamp).toBe("function");
    const levelFormatter = options.formatters?.level;
    expect(levelFormatter?.("warn", 40)).toEqual({ level: "warn" });
  });

  it("redacts sensitive request headers", () => {
    expect(buildLoggerOptions().redact).toContain("req.headers.authorization");
  });

  it("honors LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "debug";
    expect(buildLoggerOptions().level).toBe("debug");
  });

  it("configures a rotating file transport with retention when LOG_DESTINATION=file", () => {
    process.env.LOG_DESTINATION = "file";
    const transport = buildLoggerOptions().transport as {
      target: string;
      options: Record<string, unknown>;
    };
    expect(transport.target).toBe("pino-roll");
    expect(transport.options).toMatchObject({
      file: "logs/gateway.log",
      frequency: "daily",
      size: "10m",
      limit: { count: 14 },
      mkdir: true,
    });
  });

  it("applies file, rotation, and retention overrides", () => {
    process.env.LOG_DESTINATION = "file";
    process.env.LOG_FILE = "/var/log/gw.log";
    process.env.LOG_ROTATION_FREQUENCY = "hourly";
    process.env.LOG_ROTATION_MAX_SIZE = "50m";
    process.env.LOG_RETENTION_FILES = "7";
    const transport = buildLoggerOptions().transport as { options: Record<string, unknown> };
    expect(transport.options).toMatchObject({
      file: "/var/log/gw.log",
      frequency: "hourly",
      size: "50m",
      limit: { count: 7 },
    });
  });
});
