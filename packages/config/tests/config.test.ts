import { describe, expect, it } from "vitest";

import {
  parseDistributedEnvironment,
  servicePortDefaults,
} from "../src/index.js";

describe("distributed configuration foundation", () => {
  it("provides safe defaults without requiring distributed-only secrets", () => {
    const config = parseDistributedEnvironment({});

    expect(config.NODE_ENV).toBe("development");
    expect(config.SERVICE_NAME).toBe("terqivo-service");
    expect(config.SERVICE_PORT).toBe(5000);
    expect(config.INTERNAL_SERVICE_AUTH_SECRET).toBeUndefined();
  });

  it("parses a service configuration without exposing secret values", () => {
    const config = parseDistributedEnvironment({
      NODE_ENV: "production",
      SERVICE_NAME: "message-server",
      SERVICE_PORT: "5102",
      INTERNAL_SERVICE_AUTH_ISSUER: "terqivo-internal",
      INTERNAL_SERVICE_AUTH_AUDIENCE: "terqivo-services",
      INTERNAL_SERVICE_AUTH_SECRET: "01234567890123456789012345678901",
    });

    expect(config.SERVICE_NAME).toBe("message-server");
    expect(config.SERVICE_PORT).toBe(5102);
    expect(config.INTERNAL_SERVICE_AUTH_SECRET).toHaveLength(32);
  });

  it("rejects a short secret only when service auth is enabled", () => {
    expect(() =>
      parseDistributedEnvironment(
        { INTERNAL_SERVICE_AUTH_SECRET: "too-short" },
        { requireInternalServiceSecret: true },
      ),
    ).toThrow("INTERNAL_SERVICE_AUTH_SECRET");
  });

  it("keeps the proposed ports centralized", () => {
    expect(servicePortDefaults).toEqual({
      gateway: 5000,
      auth: 5101,
      message: 5102,
      call: 5103,
      media: 5104,
      notification: 5105,
      search: 5106,
      admin: 5107,
    });
  });
});
