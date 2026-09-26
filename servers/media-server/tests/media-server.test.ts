import { SignJWT } from "jose";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { env } from "../src/config/env.js";
import { createMediaApp } from "../src/app.js";
import { issueServiceToken } from "../src/internal/service-auth.js";

const app = createMediaApp();

describe("Media Server", () => {
  it("reports process health without exposing configuration", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.data.serviceName).toBe("media-server-test");
    expect(JSON.stringify(response.body)).not.toContain("mongodb://");
  });

  it("reports not ready while MongoDB is unavailable", async () => {
    const response = await request(app).get("/ready");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("MEDIA_SERVICE_NOT_READY");
  });

  it("rejects internal storage access without a service token", async () => {
    const response = await request(app).put("/internal/media/files/00000000-0000-0000-0000-000000000001.bin").send(Buffer.from("secret"));
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INTERNAL_SERVICE_UNAUTHORIZED");
  });

  it("stores and streams binary bytes through the internal API", async () => {
    const token = await issueServiceToken("message-server");
    const key = "00000000-0000-0000-0000-000000000002.bin";
    const bytes = Buffer.from([0, 1, 2, 3, 250, 251]);
    const put = await request(app).put(`/internal/media/files/${key}`).set("x-internal-service-token", token).set("content-type", "application/octet-stream").send(bytes);
    expect(put.status).toBe(201);
    const get = await request(app).get(`/internal/media/files/${key}`).set("x-internal-service-token", token);
    expect(get.status).toBe(200);
    expect(Buffer.from(get.body)).toEqual(bytes);
  });

  it("accepts Status Server for status media references", async () => {
    const token = await issueServiceToken("status-server");
    const key = "00000000-0000-0000-0000-000000000003.bin";
    const put = await request(app).put(`/internal/media/files/${key}`).set("x-internal-service-token", token).set("content-type", "application/octet-stream").send(Buffer.from([7, 8, 9]));
    expect(put.status).toBe(201);
    const removed = await request(app).delete(`/internal/media/files/${key}`).set("x-internal-service-token", token);
    expect(removed.status).toBe(200);
  });

  it("rejects unsafe storage keys", async () => {
    const token = await issueServiceToken("message-server");
    const response = await request(app).get("/internal/media/files/not-a-safe-key").set("x-internal-service-token", token);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_MEDIA_KEY");
  });

  it("keeps an encrypted upload opaque and returns the existing upload contract", async () => {
    const token = await accessToken();
    const bytes = Buffer.from([0xff, 0x00, 0x73, 0x69, 0x67, 0x6e, 0x61, 0x6c]);
    const response = await request(app)
      .post("/api/v1/conversations/000000000000000000000001/media/encrypted/upload?clientMessageId=opaque-1&type=file")
      .set("authorization", `Bearer ${token}`)
      .set("content-type", "application/octet-stream")
      .send(bytes);
    expect(response.status).toBe(201);
    expect(response.body.data.storageKey).toMatch(/\.bin$/);
    const storageToken = await issueServiceToken("message-server");
    const stored = await request(app).get(`/internal/media/files/${response.body.data.storageKey}`).set("x-internal-service-token", storageToken);
    expect(Buffer.from(stored.body)).toEqual(bytes);
  });

  it("streams a validated ordinary upload and preserves the response shape", async () => {
    const token = await accessToken();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const response = await request(app)
      .post("/api/v1/conversations/000000000000000000000001/media?clientMessageId=image-1&type=image")
      .set("authorization", `Bearer ${token}`)
      .set("content-type", "image/png")
      .set("x-file-name", "photo.png")
      .send(png);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, data: { duplicate: false, message: { id: "mock-message" } } });
    expect(response.body.data.message.media.mimeType).toBe("image/png");
  });
});

async function accessToken(): Promise<string> {
  return new SignJWT({ sessionId: "00000000-0000-0000-0000-000000000099" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setSubject("00000000-0000-0000-0000-000000000098")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}
