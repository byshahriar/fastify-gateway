import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildLoggerOptions, flushLogDestinations } from "@/config/logger";

const KEYS = [
  "LOG_LEVEL",
  "LOG_DESTINATION",
  "LOG_FILE",
  "LOG_ROTATION_FREQUENCY",
  "LOG_ROTATION_MAX_SIZE",
  "LOG_RETENTION_FILES",
  "LOG_BUFFER_BYTES",
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
  it("defaults to the console channel (no transport, no stream)", async () => {
    const options = await buildLoggerOptions();
    expect(options.transport).toBeUndefined();
    expect(options.stream).toBeUndefined();
    expect(options.level).toBe("info");
  });

  it("uses a standard format: ISO timestamps and level labels", async () => {
    const options = await buildLoggerOptions();
    expect(typeof options.timestamp).toBe("function");
    const levelFormatter = options.formatters?.level;
    expect(levelFormatter?.("warn", 40)).toEqual({ level: "warn" });
  });

  it("redacts sensitive request headers", async () => {
    expect((await buildLoggerOptions()).redact).toContain("req.headers.authorization");
  });

  it("honors LOG_LEVEL", async () => {
    process.env.LOG_LEVEL = "debug";
    expect((await buildLoggerOptions()).level).toBe("debug");
  });

  it("configures a rotating file transport with retention when LOG_DESTINATION=file", async () => {
    process.env.LOG_DESTINATION = "file";
    const transport = (await buildLoggerOptions()).transport as {
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

  it("applies file, rotation, and retention overrides", async () => {
    process.env.LOG_DESTINATION = "file";
    process.env.LOG_FILE = "/var/log/gw.log";
    process.env.LOG_ROTATION_FREQUENCY = "hourly";
    process.env.LOG_ROTATION_MAX_SIZE = "50m";
    process.env.LOG_RETENTION_FILES = "7";
    const transport = (await buildLoggerOptions()).transport as {
      options: Record<string, unknown>;
    };
    expect(transport.options).toMatchObject({
      file: "/var/log/gw.log",
      frequency: "hourly",
      size: "50m",
      limit: { count: 7 },
    });
  });

  it("fans out to console and file channels when both are requested", async () => {
    process.env.LOG_DESTINATION = "console,file";
    process.env.LOG_FILE = join(mkdtempSync(join(tmpdir(), "gw-logger-")), "gateway.log");

    const options = await buildLoggerOptions();
    // Multi-channel uses an in-process multistream, not worker transports,
    // so the level-label formatter keeps applying to every channel.
    expect(options.transport).toBeUndefined();
    expect(options.formatters?.level).toBeDefined();

    const stream = options.stream as { write: (s: string) => void; streams: unknown[] };
    expect(typeof stream.write).toBe("function");
    expect(stream.streams).toHaveLength(2);
  });

  it("rejects unknown LOG_DESTINATION channels", async () => {
    process.env.LOG_DESTINATION = "console,syslog";
    await expect(buildLoggerOptions()).rejects.toThrow(/Invalid LOG_DESTINATION channel/);
  });

  it("uses a buffered async stdout destination when LOG_BUFFER_BYTES is set", async () => {
    process.env.LOG_BUFFER_BYTES = "4096";
    const options = await buildLoggerOptions();
    const stream = options.stream as { write: (s: string) => void; flushSync?: () => void };
    expect(typeof stream.write).toBe("function");
    expect(typeof stream.flushSync).toBe("function");
  });

  it("flushes in-process destinations without throwing", async () => {
    process.env.LOG_BUFFER_BYTES = "4096";
    await buildLoggerOptions();
    expect(() => flushLogDestinations()).not.toThrow();
  });
});
