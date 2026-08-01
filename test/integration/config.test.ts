import { describe, expect, it } from "vitest";
import { buildTestApp } from "@test/helpers/app";

describe("configuration", () => {
  it("applies schema defaults", async () => {
    const app = await buildTestApp();
    expect(app.config.PORT).toBe(8080);
    expect(app.config.HOST).toBe("0.0.0.0");
    expect(app.config.RATE_LIMIT_MAX).toBe(100);
    expect(app.config.UPSTREAM_TIMEOUT_MS).toBe(10000);
    expect(app.config.CORS_ALLOW_CREDENTIALS).toBe(false);
    await app.close();
  });

  it("coerces numeric and boolean env strings", async () => {
    const app = await buildTestApp({
      PORT: "9123",
      RATE_LIMIT_MAX: "5",
      CORS_ORIGINS: "https://app.example.com",
      CORS_ALLOW_CREDENTIALS: "true",
    });
    expect(app.config.PORT).toBe(9123);
    expect(app.config.RATE_LIMIT_MAX).toBe(5);
    expect(app.config.CORS_ALLOW_CREDENTIALS).toBe(true);
    await app.close();
  });

  it("refuses to start on non-numeric numeric config", async () => {
    await expect(buildTestApp({ PORT: "not-a-port" })).rejects.toThrow();
  });

  it("refuses to start on a malformed BASIC_AUTH_USERS list", async () => {
    await expect(buildTestApp({ BASIC_AUTH_USERS: "missing-colon" })).rejects.toThrow(
      /username:password/,
    );
  });
});
