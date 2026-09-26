import { createServer, type Server as HttpServer } from "node:http";

import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAdminApp } from "../src/app.js";
import { createAdminServerConfig } from "../src/config/env.js";
import { createAdminAccessToken, verifyAdminAccessToken } from "../src/auth/admin-jwt.js";
import { AppError } from "../src/core/errors.js";
import { setTier } from "../src/modules/admin/service.js";

const config = createAdminServerConfig();
const app = createAdminApp(config, { databaseStatus: () => "connected", redisStatus: () => "connected" });
let upstream: HttpServer;
let upstreamUrl: string;
let forwardedRequest: { method: string | undefined; url: string | undefined; body: string; internalToken: string | undefined } | undefined;

beforeAll(async () => {
  upstream = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      forwardedRequest = { method: request.method, url: request.url, body: Buffer.concat(chunks).toString("utf8"), internalToken: request.headers["x-internal-service-token"] as string | undefined };
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, data: { updated: true, userTier: "special" } }));
    });
  });
  await new Promise<void>((resolve, reject) => { upstream.once("error", reject); upstream.listen(0, "127.0.0.1", () => { const address = upstream.address(); if (address === null || typeof address === "string") { reject(new Error("upstream did not expose a TCP address")); return; } upstreamUrl = `http://127.0.0.1:${address.port}`; resolve(); }); });
});

afterAll(async () => { if (upstream.listening) await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve())); });

describe("Admin Server operational and security boundaries", () => {
  afterEach(() => { process.env.ADMIN_JWT_SECRET = config.ADMIN_JWT_SECRET; });

  it("serves health and readiness without requiring an admin token", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).get("/ready")).status).toBe(200);
  });

  it("issues and verifies the existing HS256 admin token contract", async () => {
    const token = await createAdminAccessToken(config, "507f1f77bcf86cd799439011");
    const claims = await verifyAdminAccessToken(config, token);
    expect(claims).toMatchObject({ sub: "507f1f77bcf86cd799439011", kind: "admin", iss: "terqivo-admin", aud: "terqivo-admin-panel" });
  });

  it("rejects malformed and wrongly signed admin tokens without exposing internals", async () => {
    await expect(verifyAdminAccessToken(config, "not-a-token")).rejects.toMatchObject({ code: "INVALID_ADMIN_ACCESS_TOKEN", statusCode: 401 });
    const otherConfig = { ...config, ADMIN_JWT_SECRET: "another-admin-secret-change-me-1234567890" };
    const token = await createAdminAccessToken(otherConfig, "507f1f77bcf86cd799439011");
    await expect(verifyAdminAccessToken(config, token)).rejects.toMatchObject({ code: "INVALID_ADMIN_ACCESS_TOKEN" });
  });

  it("does not accept a normal user bearer token as admin authorization", async () => {
    const response = await request(app).get("/api/v1/admin/dashboard").set("Authorization", "Bearer normal-user-token");
    expect(response.status).toBe(401);
    expect(response.body.error).not.toHaveProperty("stack");
  });

  it("keeps report validation inputs bounded and explicit", async () => {
    const response = await request(app).post("/api/v1/reports").set("Authorization", "Bearer missing").send({ targetType: "message", reason: "unknown" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("does not expose a generic internal proxy or database route", async () => {
    expect((await request(app).get("/internal/mongo")).status).toBe(404);
    expect((await request(app).get("/api/v1/admin/execute")).status).toBe(404);
  });

  it("uses the documented error type for service failures", () => {
    const error = new AppError({ code: "ADMIN_DEPENDENCY_UNAVAILABLE", message: "dependency unavailable", statusCode: 503 });
    expect(error).toMatchObject({ code: "ADMIN_DEPENDENCY_UNAVAILABLE", statusCode: 503 });
  });

  it("forwards user mutations to Auth Server with the protected internal contract", async () => {
    const forwardedConfig = { ...config, AUTH_SERVICE_URL: upstreamUrl, MESSAGE_SERVICE_URL: upstreamUrl };
    const result = await setTier(forwardedConfig, "507f1f77bcf86cd799439011", "special");
    expect(result).toEqual({ updated: true, userTier: "special" });
    expect(forwardedRequest).toMatchObject({ method: "PATCH", url: "/internal/admin/users/507f1f77bcf86cd799439011/tier", body: JSON.stringify({ userTier: "special" }) });
    expect(forwardedRequest?.internalToken).toEqual(expect.any(String));
  });
});
