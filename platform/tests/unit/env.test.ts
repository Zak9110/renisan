import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const dev = {
  NODE_ENV: "development",
  DATABASE_URL: "pglite://memory",
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: "change-me-32-bytes-minimum-aaaaaaaaaa",
  CRON_SECRET: "change-me-cron-secret",
};

describe("env validation", () => {
  it("accepts a local dev environment with placeholders", () => {
    expect(parseEnv(dev).SMS_PROVIDER).toBe("console");
  });
  it("rejects a short session secret and names the variable, not the value", () => {
    expect(() => parseEnv({ ...dev, SESSION_SECRET: "short-secret-value" })).toThrow(/SESSION_SECRET/);
    expect(() => parseEnv({ ...dev, SESSION_SECRET: "short-secret-value" })).not.toThrow(
      /short-secret-value/,
    );
  });
  it("rejects a non-Postgres database URL", () => {
    expect(() => parseEnv({ ...dev, DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
  });
  it("requires an OTPIQ key when the OTPIQ provider is chosen", () => {
    expect(() => parseEnv({ ...dev, SMS_PROVIDER: "otpiq" })).toThrow(/OTPIQ_API_KEY/);
  });
  it("requires APP_ENV for production builds, and allows test builds with dev services", () => {
    expect(() => parseEnv({ ...dev, NODE_ENV: "production" })).toThrow(/APP_ENV/);
    expect(parseEnv({ ...dev, NODE_ENV: "production", APP_ENV: "test" }).APP_ENV).toBe("test");
  });
  it("refuses placeholders, console SMS and PGlite in production", () => {
    const err = (() => {
      try {
        parseEnv({ ...dev, NODE_ENV: "production", APP_ENV: "production" });
      } catch (e) {
        return String(e);
      }
      return "";
    })();
    expect(err).toMatch(/SESSION_SECRET/);
    expect(err).toMatch(/CRON_SECRET/);
    expect(err).toMatch(/SMS_PROVIDER/);
    expect(err).toMatch(/DATABASE_URL/);
  });
});
