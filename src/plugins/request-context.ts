import fp from "fastify-plugin";
import { Header, SAFE_HEADER_ID_PATTERN } from "@/constants";
import { formatTraceparent, nextTraceContext } from "@/utils";

// Upper bound on a forwarded `tracestate` value; longer values are dropped
// rather than propagated (the spec caps it at 512 bytes).
const MAX_TRACESTATE_LENGTH = 512;

/**
 * Request correlation and distributed tracing plugin.
 *
 * - Honors or generates `x-request-id` (via the factory's `genReqId`).
 * - Honors or generates `x-correlation-id`, defaulting to the request id.
 * - Continues or starts a W3C `traceparent` (same trace id, new span id).
 * - Carries `tracestate` only alongside a continued trace.
 * - Binds all ids into the request logger so every log line correlates.
 * - Propagates the ids to upstreams and echoes them on the response.
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

      // Mutating req.headers here propagates the context to the upstream,
      // which the proxy layer forwards verbatim.
      req.headers[Header.RequestId] = requestId;
      req.headers[Header.CorrelationId] = correlationId;
      req.headers[Header.Traceparent] = formatTraceparent(context);

      const incomingState = req.headers[Header.Tracestate];
      const keepTracestate =
        continued &&
        typeof incomingState === "string" &&
        incomingState.length <= MAX_TRACESTATE_LENGTH;
      if (!keepTracestate) {
        delete req.headers[Header.Tracestate];
      }

      req.log = req.log.child({ correlationId, traceId: context.traceId });

      reply.header(Header.RequestId, requestId);
      reply.header(Header.CorrelationId, correlationId);
    });
  },
  { name: "request-context" },
);
