import { Readable } from "node:stream";

import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createStatusApp } from "../src/app.js";
import type { AuthClient, AuthContext, PublicUser } from "../src/clients/auth.client.js";
import type { MediaClient, MediaFile } from "../src/clients/media.client.js";
import type { RelationshipClient, StatusVisibility } from "../src/clients/relationship.client.js";
import type { StatusServerConfig } from "../src/config.js";
import { AppError } from "../src/core/errors.js";
import { StatusModel } from "../src/models/status.model.js";

const userA = "507f1f77bcf86cd799439011";
const userB = "507f1f77bcf86cd799439012";
const userC = "507f1f77bcf86cd799439013";
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const config: StatusServerConfig = {
  NODE_ENV: "test", SERVICE_NAME: "status-server", SERVICE_VERSION: "test", PORT: 5110,
  MONGODB_URI: "mongodb://127.0.0.1:27017/terqivo_status_phase13_test", WEB_ORIGIN: "http://localhost:3000",
  AUTH_SERVICE_URL: "http://127.0.0.1:5101", RELATIONSHIP_SERVICE_URL: "http://127.0.0.1:5109", MEDIA_SERVICE_URL: "http://127.0.0.1:5104",
  INTERNAL_SERVICE_SECRET: "phase13-status-test-secret-which-is-long-enough", INTERNAL_SERVICE_ISSUER: "terqivo-internal", INTERNAL_SERVICE_AUDIENCE: "terqivo-services",
  STATUS_MAX_MEDIA_SIZE_BYTES: 50 * 1024 * 1024, LOG_LEVEL: "silent", TRUST_PROXY_HOPS: 0,
};

const users: Record<string, PublicUser> = {
  [userA]: { id: userA, username: "status_a", displayName: "Status A", phone: null, avatarUrl: null, bio: null, accountType: "personal", badges: [], accountStatus: "active" },
  [userB]: { id: userB, username: "status_b", displayName: "Status B", phone: null, avatarUrl: null, bio: null, accountType: "personal", badges: [], accountStatus: "active" },
  [userC]: { id: userC, username: "status_c", displayName: "Status C", phone: null, avatarUrl: null, bio: null, accountType: "personal", badges: [], accountStatus: "active" },
};

class FakeAuth implements AuthClient {
  public unavailable = false;
  public async validateAccessToken(token: string): Promise<AuthContext> {
    if (this.unavailable) throw new AppError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "The identity service is unavailable.", statusCode: 503 });
    const userId = token === "token-a" ? userA : token === "token-b" ? userB : token === "token-c" ? userC : undefined;
    if (userId === undefined) throw new AppError({ code: "INVALID_ACCESS_TOKEN", message: "The access token is invalid or expired.", statusCode: 401 });
    return { userId, sessionId: `session-${userId}` };
  }
  public async batchPublicUsers(userIds: string[]): Promise<PublicUser[]> {
    if (this.unavailable) throw new AppError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "The identity service is unavailable.", statusCode: 503 });
    return userIds.flatMap((id) => users[id] === undefined ? [] : [users[id]]);
  }
}

class FakeRelationships implements RelationshipClient {
  public contacts = new Set<string>();
  public blocked = new Set<string>();
  public unavailable = false;
  public async statusVisibility(viewerId: string, ownerIds: string[]): Promise<StatusVisibility[]> {
    if (this.unavailable) throw new AppError({ code: "RELATIONSHIP_SERVICE_UNAVAILABLE", message: "Relationship information is temporarily unavailable.", statusCode: 503 });
    return ownerIds.map((ownerId) => ({ ownerId, areContacts: viewerId === ownerId || this.contacts.has(`${viewerId}:${ownerId}`), blocked: this.blocked.has(`${viewerId}:${ownerId}`) || this.blocked.has(`${ownerId}:${viewerId}`) }));
  }
}

class FakeMedia implements MediaClient {
  public files = new Map<string, Buffer>();
  public unavailable = false;
  public async put(key: string, data: Buffer): Promise<void> { if (this.unavailable) throw new AppError({ code: "MEDIA_SERVICE_UNAVAILABLE", message: "Media storage is temporarily unavailable.", statusCode: 503 }); this.files.set(key, Buffer.from(data)); }
  public async open(key: string, _mimeType: string): Promise<MediaFile | null> { const data = this.files.get(key); return data === undefined ? null : { stream: Readable.from(data), size: data.length }; }
  public async remove(key: string): Promise<void> { this.files.delete(key); }
}

const auth = new FakeAuth();
const relationships = new FakeRelationships();
const media = new FakeMedia();
const app = createStatusApp(config, { auth, relationships, media, databaseStatus: () => "connected" });

beforeAll(async () => { await mongoose.connect(config.MONGODB_URI); });
beforeEach(async () => { await StatusModel.deleteMany({}); auth.unavailable = false; relationships.unavailable = false; relationships.contacts.clear(); relationships.blocked.clear(); media.unavailable = false; media.files.clear(); });
afterAll(async () => { await StatusModel.deleteMany({}); await mongoose.disconnect(); });

describe("Status Server compatibility", () => {
  it("serves health and readiness and rejects invalid JWTs", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).get("/ready")).status).toBe(200);
    expect((await request(app).get("/api/v1/status").set("Authorization", "Bearer invalid")).status).toBe(401);
  });

  it("creates with the authenticated actor, preserves the feed, order, expiry and duplicate-view semantics", async () => {
    const created = await request(app).post("/api/v1/status").set("Authorization", "Bearer token-a").send({ text: "hello", userId: userB });
    expect(created.status).toBe(201);
    const statusId = created.body.data.status.id as string;
    expect(created.body.data.status.author.id).toBe(userA);
    relationships.contacts.add(`${userB}:${userA}`);
    const feed = await request(app).get("/api/v1/status").set("Authorization", "Bearer token-b");
    expect(feed.status).toBe(200);
    expect(feed.body.data.statuses[0].id).toBe(statusId);
    expect(feed.body.data.statuses[0].viewed).toBe(false);
    expect((await request(app).post(`/api/v1/status/${statusId}/view`).set("Authorization", "Bearer token-b")).status).toBe(200);
    expect((await request(app).post(`/api/v1/status/${statusId}/view`).set("Authorization", "Bearer token-b")).status).toBe(200);
    const ownerFeed = await request(app).get("/api/v1/status").set("Authorization", "Bearer token-a");
    expect(ownerFeed.body.data.statuses[0].viewerCount).toBe(1);
    expect(ownerFeed.body.data.statuses[0].viewers).toHaveLength(1);
    await StatusModel.create({ ownerId: userA, type: "text", text: "expired", media: null, viewedBy: [], expiresAt: new Date(Date.now() - 1000) });
    const afterExpiry = await request(app).get("/api/v1/status").set("Authorization", "Bearer token-a");
    expect(afterExpiry.body.data.statuses.every((item: { text: string }) => item.text !== "expired")).toBe(true);
  });

  it("enforces contact and block policy and fails closed when Relationship Server is unavailable", async () => {
    const created = await request(app).post("/api/v1/status").set("Authorization", "Bearer token-a").send({ text: "protected" });
    const statusId = created.body.data.status.id as string;
    relationships.contacts.add(`${userB}:${userA}`);
    expect((await request(app).get("/api/v1/status").set("Authorization", "Bearer token-b")).body.data.statuses).toHaveLength(1);
    relationships.blocked.add(`${userA}:${userB}`);
    expect((await request(app).get("/api/v1/status").set("Authorization", "Bearer token-b")).body.data.statuses).toHaveLength(0);
    expect((await request(app).post(`/api/v1/status/${statusId}/view`).set("Authorization", "Bearer token-b")).status).toBe(404);
    relationships.unavailable = true;
    expect((await request(app).get("/api/v1/status").set("Authorization", "Bearer token-b")).status).toBe(503);
  });

  it("prevents another user from deleting a status and supports media through the Media Server boundary", async () => {
    const created = await request(app).post("/api/v1/status/media?type=image").set("Authorization", "Bearer token-a").set("Content-Type", "image/png").set("X-File-Name", "one.png").send(Buffer.from(pngBase64, "base64"));
    expect(created.status).toBe(201);
    const statusId = created.body.data.status.id as string;
    expect((await request(app).delete(`/api/v1/status/${statusId}`).set("Authorization", "Bearer token-b")).status).toBe(404);
    relationships.contacts.add(`${userB}:${userA}`);
    const downloaded = await request(app).get(`/api/v1/status/${statusId}/media`).set("Authorization", "Bearer token-b");
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["content-type"]).toContain("image/png");
    expect(Buffer.from(downloaded.body).toString("base64")).toBe(pngBase64);
    expect((await request(app).delete(`/api/v1/status/${statusId}`).set("Authorization", "Bearer token-a")).status).toBe(200);
    expect(media.files.size).toBe(0);
  });

  it("rejects media storage failure and identity-service failure without creating a status", async () => {
    media.unavailable = true;
    expect((await request(app).post("/api/v1/status/media?type=image").set("Authorization", "Bearer token-a").set("Content-Type", "image/png").send(Buffer.from(pngBase64, "base64"))).status).toBe(503);
    expect(await StatusModel.countDocuments({})).toBe(0);
    auth.unavailable = true;
    expect((await request(app).post("/api/v1/status").set("Authorization", "Bearer token-a").send({ text: "hello" })).status).toBe(503);
  });
});
