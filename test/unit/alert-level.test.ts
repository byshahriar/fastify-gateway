import { describe, expect, it } from "vitest";
import { alertThreshold, severityForStatus } from "@/utils";

describe("alertThreshold", () => {
  it("alerts on 5xx only at the error level", () => {
    expect(alertThreshold("error")).toBe(500);
  });

  it("alerts on 4xx and 5xx at the warn level", () => {
    expect(alertThreshold("warn")).toBe(400);
  });

  it("defaults to the error threshold for an unrecognized level", () => {
    expect(alertThreshold("verbose")).toBe(500);
  });
});

describe("severityForStatus", () => {
  it("labels 5xx as error", () => {
    expect(severityForStatus(500)).toBe("error");
    expect(severityForStatus(502)).toBe("error");
  });

  it("labels 4xx as warning", () => {
    expect(severityForStatus(400)).toBe("warning");
    expect(severityForStatus(404)).toBe("warning");
  });
});
