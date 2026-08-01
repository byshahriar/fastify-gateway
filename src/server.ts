import { buildApp } from "@/app";

// Grace period for draining in-flight requests before a forced exit, so a
// hung upstream connection can never stall shutdown indefinitely.
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);

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
