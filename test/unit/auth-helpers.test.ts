import { describe, expect, it } from "vitest";
import { encodeBasicAuth, parseBasicAuthHeader, parseUserList, safeEqual } from "@/utils";

describe("safeEqual", () => {
  it("returns true for equal strings", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(safeEqual("secret", "secreT")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(safeEqual("secret", "secret-longer")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("parseUserList", () => {
  it("parses a single entry", () => {
    expect(parseUserList("alice:pw1")).toEqual(new Map([["alice", "pw1"]]));
  });

  it("parses multiple entries and trims whitespace", () => {
    const users = parseUserList(" alice:pw1 , bob:pw2 ");
    expect(users.get("alice")).toBe("pw1");
    expect(users.get("bob")).toBe("pw2");
  });

  it("returns an empty map for an empty string", () => {
    expect(parseUserList("").size).toBe(0);
  });

  it("keeps colons inside passwords", () => {
    expect(parseUserList("alice:pw:with:colons").get("alice")).toBe("pw:with:colons");
  });

  it("throws on an entry without a colon", () => {
    expect(() => parseUserList("alice")).toThrow(/username:password/);
  });

  it("throws on an empty username or password", () => {
    expect(() => parseUserList(":pw")).toThrow();
    expect(() => parseUserList("alice:")).toThrow();
  });
});

describe("parseBasicAuthHeader", () => {
  const encode = (value: string) => `Basic ${Buffer.from(value).toString("base64")}`;

  it("decodes valid credentials", () => {
    expect(parseBasicAuthHeader(encode("alice:pw1"))).toEqual({
      username: "alice",
      password: "pw1",
    });
  });

  it("is case-insensitive about the scheme", () => {
    expect(parseBasicAuthHeader(encode("alice:pw1").replace("Basic", "bAsIc"))).not.toBeNull();
  });

  it("splits on the first colon only", () => {
    expect(parseBasicAuthHeader(encode("alice:pw:x"))?.password).toBe("pw:x");
  });

  it("returns null for a missing header", () => {
    expect(parseBasicAuthHeader(undefined)).toBeNull();
  });

  it("returns null for other schemes", () => {
    expect(parseBasicAuthHeader("Bearer some-token")).toBeNull();
  });

  it("returns null when the payload has no colon", () => {
    expect(
      parseBasicAuthHeader(`Basic ${Buffer.from("no-colon").toString("base64")}`),
    ).toBeNull();
  });

  it("returns null for garbage base64", () => {
    expect(parseBasicAuthHeader("Basic !!!")).toBeNull();
  });
});

describe("encodeBasicAuth", () => {
  it("round-trips through parseBasicAuthHeader", () => {
    expect(parseBasicAuthHeader(encodeBasicAuth("svc:secret"))).toEqual({
      username: "svc",
      password: "secret",
    });
  });
});
