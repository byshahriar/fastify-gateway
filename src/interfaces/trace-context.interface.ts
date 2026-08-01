/**
 * Parsed W3C Trace Context values (https://www.w3.org/TR/trace-context/).
 */
export interface TraceContext {
  /**
   * 16-byte trace id, lowercase hex.
   */
  traceId: string;
  /**
   * 8-byte span id, lowercase hex.
   */
  spanId: string;
  /**
   * Trace flags, e.g. `"01"` when sampled.
   */
  flags: string;
}
