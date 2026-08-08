import { config as loadEnv } from "dotenv";
import { envBoolean, envNumber } from "@/config/env";
import { flushLogDestinations } from "@/config/logger";

// Load .env into process.env first, before anything reads it — including the
// Fastify factory options (logger, timeouts, trust proxy) consumed before
// @fastify/env validates the schema. A missing .env is not an error; in
// production configuration comes from the real environment.
loadEnv({ quiet: true });

// Grace period for draining in-flight requests before a forced exit, so a
// hung upstream connection can never stall shutdown indefinitely. Validated
// to fail fast; a bad value would otherwise coerce to 0 and turn graceful
// shutdown into an immediate hard exit.
const SHUTDOWN_TIMEOUT_MS = envNumber("SHUTDOWN_TIMEOUT_MS", 10_000, 1);

// Start OpenTelemetry before the application modules are imported so its
// instrumentations can patch them. Dynamic imports keep both the SDK and the
// app out of the module graph until this point.
let otelShutdown: (() => Promise<void>) | undefined;
if (envBoolean("OTEL_ENABLED", false)) {
  const { startOtel } = await import("@/otel");
  otelShutdown = await startOtel();
}

const { buildApp } = await import("@/app");

const app = await buildApp();
await app.ready();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "shutting down");
    app.shuttingDown = true;

    const deadline = setTimeout(() => {
      app.log.error("shutdown deadline exceeded, exiting");
      flushLogDestinations();
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    deadline.unref();

    try {
      await app.close();
      if (otelShutdown) await otelShutdown();
      flushLogDestinations();
      process.exit(0);
    } catch (err) {
      app.log.error(err, "error during shutdown");
      flushLogDestinations();
      process.exit(1);
    }
  });
}

try {
  await app.listen({ port: app.config.PORT, host: app.config.HOST });
} catch (err) {
  app.log.error(err);
  flushLogDestinations();
  process.exit(1);
}
