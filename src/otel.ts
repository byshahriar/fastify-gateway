/**
 * OpenTelemetry bootstrap (feature-flagged by `OTEL_ENABLED`).
 *
 * Started from `server.ts` before the application modules are imported, so the
 * HTTP, undici (upstream proxy), and Fastify instrumentations can patch them.
 * Spans are exported over OTLP/HTTP; endpoint, headers, and sampling are
 * configured through the standard `OTEL_*` environment variables
 * (e.g. `OTEL_EXPORTER_OTLP_ENDPOINT`). This complements the gateway's native
 * W3C trace-context propagation by emitting actual spans to a collector.
 *
 * The SDK dependencies are imported dynamically so nothing loads unless the
 * flag is on.
 *
 * @returns A shutdown function that flushes and stops the SDK.
 */
export async function startOtel(): Promise<() => Promise<void>> {
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");
  const { HttpInstrumentation } = await import("@opentelemetry/instrumentation-http");
  const { UndiciInstrumentation } = await import("@opentelemetry/instrumentation-undici");
  const { FastifyInstrumentation } = await import("@opentelemetry/instrumentation-fastify");

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "fastify-gateway",
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation(),
      new UndiciInstrumentation(),
      new FastifyInstrumentation(),
    ],
  });

  sdk.start();
  return () => sdk.shutdown();
}
