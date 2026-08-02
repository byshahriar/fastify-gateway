import { describe, expect, it } from "vitest";
import { parseBearerToken } from "@/utils";

describe("parseBearerToken", () => {
  it("extracts the token from a Bearer header", () => {
    expect(parseBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("is case-insensitive and tolerates extra spaces", () => {
    expect(parseBearerToken("bearer   xyz")).toBe("xyz");
  });

  it("returns null for a missing header", () => {
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it("returns null for a non-Bearer scheme", () => {
    expect(parseBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
  });

  it("returns null when the token part is absent", () => {
    expect(parseBearerToken("Bearer")).toBeNull();
  });
});
