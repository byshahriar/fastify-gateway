import { afterEach, describe, expect, it } from "vitest";
import { envBoolean, envNumber } from "@/config/env";
import { redactUrlCredentials } from "@/utils";

const KEY = "GATEWAY_TEST_ENV_VAR";

afterEach(() => {
  delete process.env[KEY];
});

describe("envNumber", () => {
  it("returns the fallback when unset or empty", () => {
    expect(envNumber(KEY, 42)).toBe(42);
    process.env[KEY] = "";
    expect(envNumber(KEY, 42)).toBe(42);
  });

  it("parses a valid number", () => {
    process.env[KEY] = "1500";
    expect(envNumber(KEY, 42)).toBe(1500);
  });

  it("throws on a non-numeric value instead of coercing to NaN", () => {
    process.env[KEY] = "abc";
    expect(() => envNumber(KEY, 42)).toThrow(/expected a number/);
  });

  it("throws below the minimum", () => {
    process.env[KEY] = "0";
    expect(() => envNumber(KEY, 42, 1)).toThrow(/>= 1/);
    process.env[KEY] = "-5";
    expect(() => envNumber(KEY, 42)).toThrow(/>= 0/);
  });

  it("allows zero by default (e.g. a disabled timeout)", () => {
    process.env[KEY] = "0";
    expect(envNumber(KEY, 42)).toBe(0);
  });
});

describe("envBoolean", () => {
  it("returns the fallback when unset or empty", () => {
    expect(envBoolean(KEY, true)).toBe(true);
    process.env[KEY] = "";
    expect(envBoolean(KEY, false)).toBe(false);
  });

  it("parses true and false", () => {
    process.env[KEY] = "true";
    expect(envBoolean(KEY, false)).toBe(true);
    process.env[KEY] = "false";
    expect(envBoolean(KEY, true)).toBe(false);
  });

  it("throws on anything else", () => {
    process.env[KEY] = "1";
    expect(() => envBoolean(KEY, false)).toThrow(/"true" or "false"/);
  });
});

describe("redactUrlCredentials", () => {
  it("strips userinfo", () => {
    expect(redactUrlCredentials("https://user:pass@host:5678/path")).toBe(
      "https://host:5678/path",
    );
  });

  it("leaves a credential-free url unchanged", () => {
    expect(redactUrlCredentials("http://host:5678")).toBe("http://host:5678");
  });

  it("returns an unparseable value unchanged", () => {
    expect(redactUrlCredentials("not a url")).toBe("not a url");
  });
});
