import { createServer, type Server as HttpServer } from "node:http";

import request from "supertest";
import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AuthSessionModel, initializeAuthModels, UserModel } from "../src/internal/auth-core/index.js";
import { initializePrivacyModels } from "../src/internal/privacy.service.js";
import { PrivacySettingsModel } from "../src/internal/privacy.model.js";
import { createAuthApp } from "../src/app.js";
import type { AuthServerConfig } from "../src/config.js";
import { connectDatabase, disconnectDatabase, getDatabaseStatus } from "../src/database.js";

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
  INTERNAL_SERVICE_SECRET: "auth-server-test-internal-secret-0123456789",
  INTERNAL_SERVICE_ISSUER: "terqivo-internal",
  INTERNAL_SERVICE_AUDIENCE: "terqivo-services",
};

let server: HttpServer;

beforeAll(async () => {
  await connectDatabase(config);
  await initializeAuthModels();
  await initializePrivacyModels();
  server = createServer(createAuthApp(config, { getDatabaseStatus }));
  await listen(server);
});

beforeEach(async () => {
  await Promise.all([UserModel.deleteMany({}), AuthSessionModel.deleteMany({}), PrivacySettingsModel.deleteMany({})]);
});

afterAll(async () => {
  await closeServer(server);
  await disconnectDatabase();
});

describe("Auth Server self-contained compatibility contract", () => {
  it("issues a token and session with the legacy-compatible response shape", async () => {
    const response = await request(server).post("/api/v1/auth/register").send({
      username: "Contract.User",
      name: "Contract User",
      email: "contract@example.com",
      phone: "+14155550101",
      password: "correct horse battery staple",
      platform: "web",
    });
    expect(response.status).toBe(201);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.session.id).toEqual(expect.any(String));
  });

  it("keeps username-exists, login, and duplicate identity conflicts compatible", async () => {
    const registration = await request(server).post("/api/v1/auth/register").send({
      username: "Duplicate.User",
      name: "Duplicate User",
      email: "duplicate@example.com",
      phone: "+14155550120",
      password: "correct horse battery staple",
      platform: "android",
    });
    expect(registration.status).toBe(201);

    const exists = await request(server).get("/api/v1/auth/username-exists").query({ username: "duplicate.user" });
    expect(exists.status).toBe(200);
    expect(exists.body.data.exists).toBe(true);

    const invalidLogin = await request(server).post("/api/v1/auth/login").send({
      identifier: "Duplicate.User",
      password: "wrong-password",
      platform: "android",
    });
    expect(invalidLogin.status).toBe(401);
    expect(invalidLogin.body.error.code).toBe("INVALID_CREDENTIALS");

    const duplicateUsername = await request(server).post("/api/v1/auth/register").send({
      username: "duplicate.user",
      name: "Another User",
      email: "duplicate-username@example.com",
      phone: "+14155550121",
      password: "correct horse battery staple",
      platform: "android",
    });
    expect(duplicateUsername.status).toBe(409);
    expect(duplicateUsername.body.error.code).toBe("USERNAME_TAKEN");

    const duplicateEmail = await request(server).post("/api/v1/auth/register").send({
      username: "duplicate.email",
      name: "Another User",
      email: "DUPLICATE@example.com",
      phone: "+14155550122",
      password: "correct horse battery staple",
      platform: "android",
    });
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.error.code).toBe("EMAIL_TAKEN");

    const duplicatePhone = await request(server).post("/api/v1/auth/register").send({
      username: "duplicate.phone",
      name: "Another User",
      email: "duplicate-phone@example.com",
      phone: "+14155550120",
      password: "correct horse battery staple",
      platform: "android",
    });
    expect(duplicatePhone.status).toBe(409);
    expect(duplicatePhone.body.error.code).toBe("PHONE_TAKEN");
  });

  it("preserves refresh rotation and reuse revocation", async () => {
    const registration = await request(server).post("/api/v1/auth/register").send({
      username: "Rotation.User",
      name: "Rotation User",
      email: "rotation@example.com",
      phone: "+14155550102",
      password: "correct horse battery staple",
      platform: "web",
    });
    const accessToken = registration.body.data.accessToken as string;
    const firstRefreshToken = registration.body.data.refreshToken as string;
    const rotated = await request(server).post("/api/v1/auth/refresh").send({ refreshToken: firstRefreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(firstRefreshToken);
    const reuse = await request(server).post("/api/v1/auth/refresh").send({ refreshToken: firstRefreshToken });
    expect(reuse.status).toBe(401);
    const revokedAccess = await request(server).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(revokedAccess.status).toBe(401);
  });

  it("updates the identity profile through the extracted user route", async () => {
    const registration = await request(server).post("/api/v1/auth/register").send({
      username: "Profile.User",
      name: "Profile User",
      email: "profile@example.com",
      phone: "+14155550103",
      password: "correct horse battery staple",
      platform: "web",
    });
    const response = await request(server)
      .patch("/api/v1/users/me/profile")
      .set("Authorization", `Bearer ${registration.body.data.accessToken as string}`)
      .send({ displayName: "Updated Profile" });
    expect(response.status).toBe(200);
    expect(response.body.data.user.displayName).toBe("Updated Profile");
  });

  it("keeps privacy settings on the same public user contract", async () => {
    const registration = await request(server).post("/api/v1/auth/register").send({
      username: "Privacy.User",
      name: "Privacy User",
      email: "privacy@example.com",
      phone: "+14155550104",
      password: "correct horse battery staple",
      platform: "web",
    });
    const token = registration.body.data.accessToken as string;
    const initial = await request(server).get("/api/v1/users/me/privacy").set("Authorization", `Bearer ${token}`);
    expect(initial.status).toBe(200);
    expect(initial.body.data).toMatchObject({ profilePhoto: "everyone", lastSeen: "contacts", readReceipts: true, messageRequests: "everyone" });
    const updated = await request(server).patch("/api/v1/users/me/privacy").set("Authorization", `Bearer ${token}`).send({ profilePhoto: "nobody", readReceipts: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ profilePhoto: "nobody", readReceipts: false, lastSeen: "contacts", messageRequests: "everyone" });
  });

  it("exposes only narrow authenticated identity APIs to Relationship Server", async () => {
    const registration = await request(server).post("/api/v1/auth/register").send({
      username: "Directory.User",
      name: "Directory User",
      email: "directory@example.com",
      phone: "+14155550105",
      password: "correct horse battery staple",
      platform: "web",
    });
    const accessToken = registration.body.data.accessToken as string;
    const serviceToken = await new SignJWT({ serviceName: "relationship-server" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(config.INTERNAL_SERVICE_ISSUER).setAudience(config.INTERNAL_SERVICE_AUDIENCE).setSubject("relationship-server").setIssuedAt().setExpirationTime("1m").sign(new TextEncoder().encode(config.INTERNAL_SERVICE_SECRET as string));
    const validated = await request(server).get("/internal/auth/validate").set("x-internal-service-token", serviceToken).set("Authorization", `Bearer ${accessToken}`);
    expect(validated.status).toBe(200);
    expect(validated.body.data.userId).toBe(registration.body.data.user.id);
    const searchServiceToken = await new SignJWT({ serviceName: "search-server" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(config.INTERNAL_SERVICE_ISSUER).setAudience(config.INTERNAL_SERVICE_AUDIENCE).setSubject("search-server").setIssuedAt().setExpirationTime("1m").sign(new TextEncoder().encode(config.INTERNAL_SERVICE_SECRET as string));
    const searchValidated = await request(server).get("/internal/auth/validate").set("x-internal-service-token", searchServiceToken).set("Authorization", `Bearer ${accessToken}`);
    expect(searchValidated.status).toBe(200);
    const resolved = await request(server).get("/internal/users/resolve").query({ identifier: "Directory.User" }).set("x-internal-service-token", serviceToken);
    expect(resolved.status).toBe(200);
    expect(resolved.body.data).not.toHaveProperty("passwordHash");
    const privacy = await request(server).get(`/internal/users/${registration.body.data.user.id}/privacy`).set("x-internal-service-token", serviceToken);
    expect(privacy.status).toBe(200);
  });
});

function listen(value: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    value.once("error", reject);
    value.listen(0, "127.0.0.1", () => {
      value.removeListener("error", reject);
      resolve();
    });
  });
}

function closeServer(value: HttpServer | undefined): Promise<void> {
  if (value === undefined || !value.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    value.close((error) => (error ? reject(error) : resolve()));
  });
}
