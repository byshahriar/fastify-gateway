import { buildApp } from "@/app";
import { envNumber } from "@/config/env";

// Grace period for draining in-flight requests before a forced exit, so a
// hung upstream connection can never stall shutdown indefinitely. Validated
// to fail fast; a bad value would otherwise coerce to 0 and turn graceful
// shutdown into an immediate hard exit.
const SHUTDOWN_TIMEOUT_MS = envNumber("SHUTDOWN_TIMEOUT_MS", 10_000, 1);

const app = await buildApp();
await app.ready();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "shutting down");
    app.shuttingDown = true;

    const deadline = setTimeout(() => {
      app.log.error("shutdown deadline exceeded, exiting");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    deadline.unref();

    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err, "error during shutdown");
      process.exit(1);
    }
  });
}

try {
  await app.listen({ port: app.config.PORT, host: app.config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
