import pino from "pino";
import { envNumber } from "@/config/env";
import { Header } from "@/constants";

// Sensitive request headers never written to any log destination.
const REDACT_PATHS = [
  `req.headers.${Header.Authorization}`,
  `req.headers["${Header.ApiKey}"]`,
  `req.headers.${Header.Cookie}`,
];

/**
 * Builds the Fastify/pino logger options from the environment.
 *
 * Format is standardized structured JSON with ISO-8601 timestamps and string
 * level labels. The destination is `console` by default (stdout — correct for
 * containers, where the platform handles rotation); set `LOG_DESTINATION=file`
 * to write to a rotating file via pino-roll, with size/interval rotation
 * (`LOG_ROTATION_MAX_SIZE`, `LOG_ROTATION_FREQUENCY`) and automatic retention
 * of the most recent files (`LOG_RETENTION_FILES`).
 *
 * @returns The logger options passed to the Fastify factory.
 */
export function buildLoggerOptions(): pino.LoggerOptions {
  const options: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL ?? "info",
    redact: REDACT_PATHS,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  if (process.env.LOG_DESTINATION === "file") {
    options.transport = {
      target: "pino-roll",
      options: {
        file: process.env.LOG_FILE ?? "logs/gateway.log",
        frequency: process.env.LOG_ROTATION_FREQUENCY ?? "daily",
        size: process.env.LOG_ROTATION_MAX_SIZE ?? "10m",
        limit: { count: envNumber("LOG_RETENTION_FILES", 14, 1) },
        mkdir: true,
        dateFormat: "yyyy-MM-dd",
      },
    };
  }

  return options;
}
