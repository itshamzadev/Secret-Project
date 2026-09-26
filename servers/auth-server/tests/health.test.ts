import request from "supertest";
import { describe, expect, it } from "vitest";

import { createAuthApp } from "../src/app.js";
import type { AuthServerConfig } from "../src/config.js";

const config: AuthServerConfig = {
  NODE_ENV: "test",
  SERVICE_NAME: "auth-server",
  SERVICE_VERSION: "test",
  PORT: 5101,
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

  it("rejects admin mutation requests without the internal service credential", async () => {
    const app = createAuthApp({ ...config, INTERNAL_SERVICE_SECRET: "auth-server-test-internal-secret-0123456789" });
    const response = await request(app).patch("/internal/admin/users/507f1f77bcf86cd799439011/tier").send({ userTier: "special" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INTERNAL_SERVICE_UNAUTHORIZED");
  });
});
