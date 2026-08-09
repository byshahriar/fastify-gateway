/**
 * HTTP header names used by the gateway; standard or widely-adopted de
 * facto names, except where noted inline.
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
  // Gateway-invented; signals a response-cache hit or miss (plugins/cache.ts).
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
