import request from "supertest";
import { describe, expect, it } from "vitest";

import { createAuthApp } from "../src/app.js";
import type { AuthServerConfig } from "../src/config.js";

const config: AuthServerConfig = {
  NODE_ENV: "test",
  SERVICE_NAME: "auth-server",
  SERVICE_VERSION: "test",
  PORT: 5101,
  TRUSTED_PROXY_HOPS: 2,
  MONGODB_URI: "mongodb://127.0.0.1:27017/terqivo_connect_test",
  WEB_ORIGIN: "http://localhost:5173",
  REDIS_URL: "redis://127.0.0.1:6379",
  JWT_ACCESS_SECRET: "test-access-secret-that-is-longer-than-32-characters",
  JWT_REFRESH_SECRET: "test-refresh-secret-that-is-longer-than-32-characters",
  JWT_ISSUER: "terqivo-connect",
  JWT_AUDIENCE: "terqivo-clients",
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 365,
  AUTH_REGISTER_RATE_LIMIT_MAX: 1000,
  AUTH_LOGIN_RATE_LIMIT_MAX: 1000,
  AUTH_REFRESH_RATE_LIMIT_MAX: 1000,
  LOG_LEVEL: "silent",
};

describe("auth server health", () => {
  it("reports process health without dependency details", async () => {
    const response = await request(createAuthApp(config, { getDatabaseStatus: () => "disconnected" })).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.data.serviceName).toBe("auth-server");
    expect(response.body).not.toHaveProperty("MONGODB_URI");
  });

  it("reports readiness only when MongoDB is connected", async () => {
    const app = createAuthApp(config, { getDatabaseStatus: () => "connected", getRedisStatus: () => "connected" });
    const response = await request(app).get("/ready");
    expect(response.status).toBe(200);
    expect(response.body.data.dependencies.database).toBe("connected");
  });

  it("does not report ready when Redis is unavailable", async () => {
    const app = createAuthApp(config, { getDatabaseStatus: () => "connected", getRedisStatus: () => "disconnected" });
    const response = await request(app).get("/ready");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AUTH_SERVICE_NOT_READY");
  });

  it("trusts only the configured internal proxy hop count", () => {
    const app = createAuthApp(config);
    expect(app.get("trust proxy")).toBe(2);
  });

  it("returns a controlled error for malformed JSON", async () => {
    const app = createAuthApp(config);
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Content-Type", "application/json")
      .send('{"username":"broken"');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: { code: "INVALID_JSON", message: "The request body contains invalid JSON." },
    });
  });

  it("classifies register validation failures as client errors", async () => {
    const app = createAuthApp(config);
    const invalidPhone = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: "valid_user", name: "Valid User", phone: "03001234567", password: "long-enough-password", platform: "android" });
    expect(invalidPhone.status).toBe(400);
    expect(invalidPhone.body.error.code).toBe("VALIDATION_ERROR");

    const missingContact = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: "valid_user", name: "Valid User", password: "long-enough-password", platform: "android" });
    expect(missingContact.status).toBe(400);
    expect(missingContact.body.error.code).toBe("VALIDATION_ERROR");

    const shortPassword = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: "valid_user", name: "Valid User", email: "valid@example.com", password: "short", platform: "android" });
    expect(shortPassword.status).toBe(400);
    expect(shortPassword.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("uses the forwarded client IP for rate limiting without trusting arbitrary headers", async () => {
    const app = createAuthApp({ ...config, AUTH_LOGIN_RATE_LIMIT_MAX: 1 });
    const forwardedFor = "203.0.113.10, 198.51.100.10";
    const first = await request(app)
      .get("/api/v1/auth/username-exists")
      .query({ username: "ab" })
      .set("X-Forwarded-For", forwardedFor);
    expect(first.status).toBe(400);

    const limited = await request(app)
      .get("/api/v1/auth/username-exists")
      .query({ username: "ab" })
      .set("X-Forwarded-For", forwardedFor);
    expect(limited.status).toBe(429);

    const differentClient = await request(app)
      .get("/api/v1/auth/username-exists")
      .query({ username: "ab" })
      .set("X-Forwarded-For", "203.0.113.11, 198.51.100.10");
    expect(differentClient.status).toBe(400);
  });

  it("rejects admin mutation requests without the internal service credential", async () => {
    const app = createAuthApp({ ...config, INTERNAL_SERVICE_SECRET: "auth-server-test-internal-secret-0123456789" });
    const response = await request(app).patch("/internal/admin/users/507f1f77bcf86cd799439011/tier").send({ userTier: "special" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INTERNAL_SERVICE_UNAUTHORIZED");
  });
});
