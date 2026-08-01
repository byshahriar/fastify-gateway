/**
 * HTTP status codes the gateway responds with.
 */
export const HttpStatus = {
  Unauthorized: 401,
  NotFound: 404,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
} as const;
