/**
 * Client-facing error messages.
 */
export const ErrorMessage = {
  Unauthorized: "Unauthorized",
  NotFound: "Not found",
  GatewayMisconfigured: "Gateway misconfigured",
  UpstreamTimeout: "Upstream timeout",
  UpstreamUnavailable: "Upstream unavailable",
  InternalError: "Internal gateway error",
} as const;
