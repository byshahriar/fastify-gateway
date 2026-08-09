import fp from "fastify-plugin";
import type { FastifyError } from "fastify";
import { ErrorMessage, HttpStatus } from "@/constants";
import { errorBody } from "@/utils";

const UPSTREAM_TIMEOUT_CODES = new Set([
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "ETIMEDOUT",
]);

const UPSTREAM_CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CLOSED",
  "UND_ERR_DESTROYED",
]);

// Error code fastify-reply-from uses to wrap upstream I/O failures.
const REPLY_FROM_WRAPPER_CODE = "FST_REPLY_FROM_INTERNAL_SERVER_ERROR";

/**
 * Maps an error to the HTTP status the client should receive.
 *
 * @param err - The raised error.
 * @returns The response status code.
 */
function resolveStatus(err: FastifyError): number {
  const code = (err as NodeJS.ErrnoException).code;
  if (code && UPSTREAM_TIMEOUT_CODES.has(code)) return HttpStatus.GatewayTimeout;
  if (code && UPSTREAM_CONNECTION_CODES.has(code)) return HttpStatus.BadGateway;
  // The wrapper hides the original error code; it survives only in the message.
  if (code === REPLY_FROM_WRAPPER_CODE) {
    return /timeout/i.test(err.message) ? HttpStatus.GatewayTimeout : HttpStatus.BadGateway;
  }
  return err.statusCode ?? HttpStatus.InternalServerError;
}

/**
 * Builds the client-safe error message for a status.
 *
 * @param status - The resolved response status.
 * @param err - The raised error.
 * @returns A message that never exposes internal details for 5xx responses.
 */
function clientMessage(status: number, err: FastifyError): string {
  if (status === HttpStatus.GatewayTimeout) return ErrorMessage.UpstreamTimeout;
  if (status === HttpStatus.BadGateway || status === HttpStatus.ServiceUnavailable) {
    return ErrorMessage.UpstreamUnavailable;
  }
  if (status >= HttpStatus.InternalServerError) return ErrorMessage.InternalError;
  return err.message;
}

/**
 * Uniform error and `404` responses.
 *
 * - Registered at the root scope, so failures raised inside encapsulated
 *   service proxies are covered too.
 * - Every error body carries the request id for correlation.
 */
export default fp(
  async (fastify) => {
    fastify.setErrorHandler((err: FastifyError, req, reply) => {
      const status = resolveStatus(err);

      if (status >= HttpStatus.InternalServerError) {
        req.log.error({ err }, "request failed");
      } else {
        req.log.info({ err: { message: err.message, statusCode: status } }, "request rejected");
      }

      reply.code(status).send(errorBody(req.id, clientMessage(status, err)));
    });

    fastify.setNotFoundHandler((req, reply) => {
      reply.code(HttpStatus.NotFound).send(errorBody(req.id, ErrorMessage.NotFound));
    });
  },
  { name: "error-handler" },
);
