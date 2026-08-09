import pino from "pino";
import { envNumber } from "@/config/env";
import { Header } from "@/constants";
import { LogDestination } from "@/enums";

// Sensitive request headers never written to any log destination.
const REDACT_PATHS = [
  `req.headers.${Header.Authorization}`,
  `req.headers["${Header.ApiKey}"]`,
  `req.headers.${Header.Cookie}`,
];

// Channels LOG_DESTINATION may name.
const VALID_DESTINATIONS = new Set<string>(Object.values(LogDestination));

/**
 * Logger options plus the optional destination stream Fastify accepts
 * alongside them (used for the multi-channel and buffered cases).
 */
export type LoggerConfig = pino.LoggerOptions & { stream?: pino.DestinationStream };

type FlushableStream = pino.DestinationStream & { flushSync?: () => void };

// In-process destination streams created by the most recent build, so the
// shutdown path can flush buffered tail lines before process.exit — those
// are often the crash/shutdown lines an operator needs most. (Worker-thread
// transports flush themselves on exit and are not tracked here.)
const activeDestinations: FlushableStream[] = [];

function track<T extends FlushableStream>(stream: T): T {
  activeDestinations.push(stream);
  return stream;
}

/**
 * Synchronously flushes every in-process log destination. Best-effort and
 * safe to call at any point of shutdown, including after a fatal error.
 */
export function flushLogDestinations(): void {
  for (const stream of activeDestinations) {
    try {
      stream.flushSync?.();
    } catch {
      // Best-effort: a destroyed stream must never break shutdown.
    }
  }
}

/**
 * Parses `LOG_DESTINATION` into the set of active channels. Unknown channel
 * names fail fast: a typo must not silently redirect logs.
 *
 * @returns The channels to log to; defaults to `console`.
 */
function parseDestinations(): Set<string> {
  const channels = (process.env.LOG_DESTINATION ?? LogDestination.Console)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const set = new Set(channels.length > 0 ? channels : [LogDestination.Console]);

  for (const channel of set) {
    if (!VALID_DESTINATIONS.has(channel)) {
      throw new Error(
        `Invalid LOG_DESTINATION channel "${channel}"; expected "console", "file", or a comma-separated combination`,
      );
    }
  }
  return set;
}

/**
 * Rotating-file options shared by the single-channel worker transport and
 * the in-process multi-channel stream.
 *
 * @returns Options for pino-roll.
 */
function fileRotationOptions() {
  return {
    file: process.env.LOG_FILE ?? "logs/gateway.log",
    frequency: process.env.LOG_ROTATION_FREQUENCY ?? "daily",
    size: process.env.LOG_ROTATION_MAX_SIZE ?? "10m",
    limit: { count: envNumber("LOG_RETENTION_FILES", 14, 1) },
    mkdir: true,
    dateFormat: "yyyy-MM-dd",
  };
}

/**
 * Builds the Fastify/pino logger options from the environment. Format is
 * standardized structured JSON with ISO-8601 timestamps and string level
 * labels, identical on every channel. `LOG_DESTINATION` selects the
 * channels, singly or combined (comma-separated).
 *
 * - `console` (default) — stdout; correct for containers, where the
 *   platform handles rotation.
 * - `file` — a rotating file via pino-roll, with size/interval rotation
 *   (`LOG_ROTATION_MAX_SIZE`, `LOG_ROTATION_FREQUENCY`) and retention of
 *   the most recent files (`LOG_RETENTION_FILES`).
 * - `console,file` — both at once. This case fans out through an
 *   in-process `pino.multistream` rather than worker transports, because
 *   pino disallows custom level formatters with multiple worker targets
 *   and the log format must stay identical across channels.
 * - `LOG_BUFFER_BYTES` (default 0) enables buffered asynchronous stdout
 *   writes: log lines are batched until that many bytes accumulate instead
 *   of being written synchronously — a substantial throughput lever at
 *   high request rates. The trade-off is that a hard crash (`SIGKILL`,
 *   OOM) can lose the buffered tail; orderly shutdown flushes it (see
 *   {@link flushLogDestinations}).
 *
 * @returns The logger options (and, when a stream is composed in-process,
 *   the stream) passed to the Fastify factory.
 */
export async function buildLoggerOptions(): Promise<LoggerConfig> {
  const destinations = parseDestinations();
  const bufferBytes = envNumber("LOG_BUFFER_BYTES", 0);

  // Streams from a previous build (tests, embedded apps) are no longer the
  // process's live destinations; only the latest build should be flushed.
  activeDestinations.length = 0;

  const options: LoggerConfig = {
    level: process.env.LOG_LEVEL ?? "info",
    redact: REDACT_PATHS,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  const stdoutDestination = () =>
    track(
      bufferBytes > 0
        ? pino.destination({ dest: 1, sync: false, minLength: bufferBytes })
        : pino.destination(1),
    );

  if (destinations.has(LogDestination.Console) && destinations.has(LogDestination.File)) {
    const { default: pinoRoll } = await import("pino-roll");
    const fileStream = track(await pinoRoll(fileRotationOptions()));
    const level = options.level as pino.Level;
    options.stream = pino.multistream([
      { stream: stdoutDestination(), level },
      { stream: fileStream, level },
    ]);
  } else if (destinations.has(LogDestination.File)) {
    options.transport = {
      target: "pino-roll",
      options: fileRotationOptions(),
    };
  } else if (bufferBytes > 0) {
    options.stream = stdoutDestination();
  }

  return options;
}
