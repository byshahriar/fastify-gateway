import fp from "fastify-plugin";
import { Header, SAFE_HEADER_ID_PATTERN } from "@/constants";
import { formatTraceparent, nextTraceContext } from "@/utils";

// Upper bound on a forwarded `tracestate` value; longer values are dropped
// rather than propagated (the spec caps it at 512 bytes).
const MAX_TRACESTATE_LENGTH = 512;

/**
 * Request correlation and distributed tracing plugin. For every request the
 * gateway:
 *
 * - honors or generates `x-request-id` (via the factory's `genReqId`),
 * - honors or generates `x-correlation-id` (defaults to the request id),
 * - continues or starts a W3C `traceparent` (same trace id, new span id),
 * - carries `tracestate` only alongside a continued trace,
 * - binds all ids into the request logger so every log line correlates,
 * - propagates the ids to upstreams and echoes them on the response.
 */
export default fp(
  async (fastify) => {
    fastify.decorateRequest("correlationId", "");
    fastify.decorateRequest("traceId", "");

    fastify.addHook("onRequest", async (req, reply) => {
      const requestId = req.id as string;
      const incomingCorrelation = req.headers[Header.CorrelationId];
      const correlationId =
        typeof incomingCorrelation === "string" &&
        SAFE_HEADER_ID_PATTERN.test(incomingCorrelation)
          ? incomingCorrelation
          : requestId;

      const incomingTrace = req.headers[Header.Traceparent];
      const { context, continued } = nextTraceContext(
        typeof incomingTrace === "string" ? incomingTrace : undefined,
      );

      req.correlationId = correlationId;
      req.traceId = context.traceId;

      // Incoming headers are forwarded verbatim by the proxy layer, so
      // setting them here propagates the context to every upstream.
      req.headers[Header.RequestId] = requestId;
      req.headers[Header.CorrelationId] = correlationId;
      req.headers[Header.Traceparent] = formatTraceparent(context);

      // tracestate is vendor state keyed to the trace. Keep it only when the
      // trace is continued and within the spec size bound; when a new trace
      // is started any incoming tracestate is meaningless and is dropped.
      const incomingState = req.headers[Header.Tracestate];
      if (!(
        continued &&
        typeof incomingState === "string" &&
        incomingState.length <= MAX_TRACESTATE_LENGTH
      )) {
        delete req.headers[Header.Tracestate];
      }

      req.log = req.log.child({ correlationId, traceId: context.traceId });

      reply.header(Header.RequestId, requestId);
      reply.header(Header.CorrelationId, correlationId);
    });
  },
  { name: "request-context" },
);
