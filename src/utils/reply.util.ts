import type { FastifyReply, FastifyRequest } from "fastify";
import { ErrorMessage, HttpStatus } from "@/constants";
import { errorBody } from "@/utils/error.util";

/**
 * Sends the uniform 401 response.
 *
 * @param req - Request being rejected.
 * @param reply - Reply to write to.
 * @returns The reply, for use as a handler return value.
 */
export function sendUnauthorized(req: FastifyRequest, reply: FastifyReply) {
  return reply.code(HttpStatus.Unauthorized).send(errorBody(req.id, ErrorMessage.Unauthorized));
}

/**
 * Logs a configuration problem and sends the uniform 500 response.
 *
 * @param req - Request being rejected.
 * @param reply - Reply to write to.
 * @param detail - Operator-facing detail for the log; never sent to clients.
 * @returns The reply, for use as a handler return value.
 */
export function sendMisconfigured(req: FastifyRequest, reply: FastifyReply, detail: string) {
  req.log.error(detail);
  return reply
    .code(HttpStatus.InternalServerError)
    .send(errorBody(req.id, ErrorMessage.GatewayMisconfigured));
}
