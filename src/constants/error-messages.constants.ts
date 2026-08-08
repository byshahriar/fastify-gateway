/**
 * Client-facing error messages.
 */
export const ErrorMessage = {
  Unauthorized: "Unauthorized",
  Forbidden: "Forbidden",
  NotFound: "Not found",
  GatewayMisconfigured: "Gateway misconfigured",
  Overloaded: "Gateway overloaded",
  UpstreamTimeout: "Upstream timeout",
  UpstreamUnavailable: "Upstream unavailable",
  InternalError: "Internal gateway error",
} as const;
