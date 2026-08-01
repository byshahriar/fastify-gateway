/**
 * Standard HTTP methods recognized for metric labels. Any other method is
 * folded into `"OTHER"` so an attacker cannot inflate label cardinality with
 * arbitrary verbs.
 */
export const KNOWN_HTTP_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "TRACE",
  "CONNECT",
]);

/**
 * Label value for any method outside {@link KNOWN_HTTP_METHODS}.
 */
export const OTHER_METHOD_LABEL = "OTHER";
