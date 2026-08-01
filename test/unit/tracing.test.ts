import { describe, expect, it } from "vitest";
import {
  formatTraceparent,
  generateSpanId,
  generateTraceId,
  nextTraceContext,
  parseTraceparent,
} from "@/utils";

const VALID = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

describe("parseTraceparent", () => {
  it("parses a valid header", () => {
    expect(parseTraceparent(VALID)).toEqual({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      flags: "01",
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseTraceparent(`  ${VALID}  `)).not.toBeNull();
  });

  it("rejects undefined and empty values", () => {
    expect(parseTraceparent(undefined)).toBeNull();
    expect(parseTraceparent("")).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(parseTraceparent("not-a-traceparent")).toBeNull();
    expect(parseTraceparent(VALID.slice(0, -1))).toBeNull();
    expect(parseTraceparent(VALID.replace("4bf9", "ZZZZ"))).toBeNull();
    expect(parseTraceparent(VALID.toUpperCase())).toBeNull();
  });

  it("rejects the forbidden version ff", () => {
    expect(parseTraceparent(VALID.replace(/^00/, "ff"))).toBeNull();
  });

  it("rejects all-zero trace and span ids", () => {
    expect(parseTraceparent(`00-${"0".repeat(32)}-00f067aa0ba902b7-01`)).toBeNull();
    expect(
      parseTraceparent(`00-4bf92f3577b34da6a3ce929d0e0e4736-${"0".repeat(16)}-01`),
    ).toBeNull();
  });
});

describe("formatTraceparent", () => {
  it("round-trips through parse", () => {
    const context = parseTraceparent(VALID);
    expect(context).not.toBeNull();
    expect(formatTraceparent(context!)).toBe(VALID);
  });
});

describe("id generation", () => {
  it("produces spec-shaped ids", () => {
    expect(generateTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(generateSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces unique ids", () => {
    expect(generateTraceId()).not.toBe(generateTraceId());
    expect(generateSpanId()).not.toBe(generateSpanId());
  });
});

describe("nextTraceContext", () => {
  it("continues an incoming trace with a new span id", () => {
    const { context, continued } = nextTraceContext(VALID);
    expect(continued).toBe(true);
    expect(context.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(context.spanId).not.toBe("00f067aa0ba902b7");
    expect(context.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(context.flags).toBe("01");
  });

  it("preserves incoming trace flags", () => {
    const { context } = nextTraceContext(VALID.replace(/01$/, "00"));
    expect(context.flags).toBe("00");
  });

  it("starts a new sampled trace when the header is absent", () => {
    const { context, continued } = nextTraceContext(undefined);
    expect(continued).toBe(false);
    expect(context.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(context.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(context.flags).toBe("01");
  });

  it("starts a new trace when the header is invalid", () => {
    const { context, continued } = nextTraceContext("garbage");
    expect(continued).toBe(false);
    expect(context.traceId).not.toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(context.traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});
