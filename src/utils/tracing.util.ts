import { randomBytes } from "node:crypto";
import type { TraceContext } from "@/interfaces";

const TRACEPARENT_PATTERN = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ZERO_TRACE_ID = "0".repeat(32);
const ZERO_SPAN_ID = "0".repeat(16);

/**
 * Generates a random trace id.
 *
 * @returns A 32-character lowercase hex string.
 */
export function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Generates a random span id.
 *
 * @returns A 16-character lowercase hex string.
 */
export function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * Parses a `traceparent` header value.
 *
 * @param header - Raw header value, if present.
 * @returns The parsed trace context, or `null` when the value is not a valid
 *   version-00 header (per spec, all-zero ids and version `ff` are invalid).
 */
export function parseTraceparent(header: string | undefined): TraceContext | null {
  if (!header) return null;

  const match = TRACEPARENT_PATTERN.exec(header.trim());
  if (!match) return null;

  const [, version, traceId, spanId, flags] = match;
  if (version === "ff") return null;
  if (traceId === ZERO_TRACE_ID || spanId === ZERO_SPAN_ID) return null;

  return { traceId, spanId, flags };
}

/**
 * Serializes a trace context as a version-00 `traceparent` header value.
 *
 * @param context - Trace context to serialize.
 * @returns The formatted header value.
 */
export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.flags}`;
}

/**
 * Derives the trace context for the next hop. A valid incoming trace is
 * continued with a fresh span id; otherwise a new sampled trace is started.
 *
 * @param incoming - Incoming `traceparent` header value, if present.
 * @returns The trace context and whether an existing trace was continued.
 */
export function nextTraceContext(incoming: string | undefined): {
  context: TraceContext;
  continued: boolean;
} {
  const parent = parseTraceparent(incoming);
  if (parent) {
    return {
      context: { traceId: parent.traceId, spanId: generateSpanId(), flags: parent.flags },
      continued: true,
    };
  }
  return {
    context: { traceId: generateTraceId(), spanId: generateSpanId(), flags: "01" },
    continued: false,
  };
}
