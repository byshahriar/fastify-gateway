/**
 * HTTP header names used by the gateway. Every value is a standard or
 * widely-adopted de facto header name, except `Cache`, which is the
 * gateway's own invented header signaling a response-cache hit or miss
 * (see `plugins/cache.ts`).
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
  ContentEncoding: "content-encoding",
  ContentLanguage: "content-language",
  ContentType: "content-type",
  Cookie: "cookie",
  Etag: "etag",
  ForwardedFor: "x-forwarded-for",
  ForwardedHost: "x-forwarded-host",
  ForwardedProto: "x-forwarded-proto",
  LastModified: "last-modified",
  RetryAfter: "retry-after",
  Vary: "vary",
  WwwAuthenticate: "www-authenticate",
} as const;
