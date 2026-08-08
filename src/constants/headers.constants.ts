/**
 * HTTP header names used by the gateway.
 */
export const Header = {
  RequestId: "x-request-id",
  CorrelationId: "x-correlation-id",
  Traceparent: "traceparent",
  Tracestate: "tracestate",
  Accept: "accept",
  AcceptEncoding: "accept-encoding",
  ApiKey: "x-api-key",
  Authorization: "authorization",
  Cache: "x-cache",
  CacheControl: "cache-control",
  Cookie: "cookie",
  ForwardedFor: "x-forwarded-for",
  ForwardedHost: "x-forwarded-host",
  ForwardedProto: "x-forwarded-proto",
  RetryAfter: "retry-after",
  Vary: "vary",
  WwwAuthenticate: "www-authenticate",
} as const;
