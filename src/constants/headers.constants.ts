/**
 * HTTP header names used by the gateway.
 */
export const Header = {
  RequestId: "x-request-id",
  CorrelationId: "x-correlation-id",
  Traceparent: "traceparent",
  Tracestate: "tracestate",
  ApiKey: "x-api-key",
  Authorization: "authorization",
  Cookie: "cookie",
  ForwardedFor: "x-forwarded-for",
  ForwardedHost: "x-forwarded-host",
  ForwardedProto: "x-forwarded-proto",
  WwwAuthenticate: "www-authenticate",
} as const;
