import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "../src/config/env.js";
import { createCallApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/database.js";
import { connectRedis, disconnectRedis } from "../src/lib/redis.js";
import { AuthSessionModel } from "../src/models/auth-session.model.js";
import { CallModel } from "../src/models/call.model.js";
import { ConversationModel } from "../src/models/conversation.model.js";
import { UserModel } from "../src/models/user.model.js";
import { setRelationshipBlocked } from "./setup.js";

const app = createCallApp();
const key = new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET);
let aliceId = "";
let bobId = "";
let aliceToken = "";
let bobToken = "";

async function accessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(userId).setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}

async function serviceToken(): Promise<string> {
  return new SignJWT({ serviceName: "realtime-hub" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(env.INTERNAL_SERVICE_ISSUER).setAudience(env.INTERNAL_SERVICE_AUDIENCE).setSubject("realtime-hub").setIssuedAt().setExpirationTime("1m").sign(key);
}

beforeAll(async () => { await connectDatabase(); await connectRedis(); });
beforeEach(async () => {
  setRelationshipBlocked(false);
  await Promise.all([CallModel.deleteMany({}), ConversationModel.deleteMany({}), AuthSessionModel.deleteMany({}), UserModel.deleteMany({})]);
  const alice = await UserModel.create({ username: "alice", displayName: "Alice", avatarUrl: null, accountStatus: "active", badges: [] });
  const bob = await UserModel.create({ username: "bob", displayName: "Bob", avatarUrl: null, accountStatus: "active", badges: [] });
  aliceId = alice._id.toString(); bobId = bob._id.toString();
  await AuthSessionModel.create({ userId: alice._id, sessionId: "alice-session", revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
  await AuthSessionModel.create({ userId: bob._id, sessionId: "bob-session", revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
  aliceToken = await accessToken(aliceId, "alice-session"); bobToken = await accessToken(bobId, "bob-session");
});
afterAll(async () => { await CallModel.deleteMany({}); await AuthSessionModel.deleteMany({}); await UserModel.deleteMany({}); await disconnectDatabase(); await disconnectRedis(); });

describe("Call Server lifecycle compatibility", () => {
  it("enforces block policy through the Relationship Server client", async () => {
    setRelationshipBlocked(true);
    const token = await serviceToken();
    const response = await request(app).post("/internal/realtime/calls/start").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ calleeId: bobId, type: "voice" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("INTERACTION_BLOCKED");
  });

  it("persists the existing call schema, enforces participants, and preserves transitions", async () => {
    const token = await serviceToken();
    const started = await request(app).post("/internal/realtime/calls/start").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ calleeId: bobId, type: "voice" });
    expect(started.status).toBe(201);
    expect(started.body.data.call).toMatchObject({ callerId: aliceId, calleeId: bobId, status: "ringing" });
    const callId = started.body.data.call.id as string;
    const history = await request(app).get("/api/v1/calls").set("Authorization", `Bearer ${aliceToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data.calls[0]).toMatchObject({ direction: "outgoing", otherUser: { id: bobId } });
    const accepted = await request(app).post("/internal/realtime/calls/accept").set("x-internal-service-token", token).set("Authorization", `Bearer ${bobToken}`).send({ callId });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.call.status).toBe("accepted");
    const switchedToVideo = await request(app).post("/internal/realtime/calls/media-type").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ callId, type: "video" });
    expect(switchedToVideo.status).toBe(200);
    expect(switchedToVideo.body.data.call.type).toBe("video");
    const switchedToVoice = await request(app).post("/internal/realtime/calls/media-type").set("x-internal-service-token", token).set("Authorization", `Bearer ${bobToken}`).send({ callId, type: "voice" });
    expect(switchedToVoice.status).toBe(200);
    expect(switchedToVoice.body.data.call.type).toBe("voice");
    const ended = await request(app).post("/internal/realtime/calls/end").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ callId });
    expect(ended.status).toBe(200);
    expect(ended.body.data.call.status).toBe("ended");
    expect((await CallModel.findById(callId).lean().exec())?.status).toBe("ended");
  });

  it("allows an immediate retry after a call is cancelled", async () => {
    const token = await serviceToken();
    const first = await request(app).post("/internal/realtime/calls/start").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ calleeId: bobId, type: "voice" });
    expect(first.status).toBe(201);

    const cancelled = await request(app).post("/internal/realtime/calls/cancel").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ callId: first.body.data.call.id });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.call.status).toBe("cancelled");

    const retry = await request(app).post("/internal/realtime/calls/start").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ calleeId: bobId, type: "voice" });
    expect(retry.status).toBe(201);
  });

  it("closes a ringing call when the caller ends during the accept race", async () => {
    const token = await serviceToken();
    const first = await request(app).post("/internal/realtime/calls/start").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ calleeId: bobId, type: "voice" });
    expect(first.status).toBe(201);

    const ended = await request(app).post("/internal/realtime/calls/end").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ callId: first.body.data.call.id });
    expect(ended.status).toBe(200);
    expect(ended.body.data.call.status).toBe("cancelled");

    const retry = await request(app).post("/internal/realtime/calls/start").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ calleeId: bobId, type: "voice" });
    expect(retry.status).toBe(201);
  });

  it("reconciles a stale ringing call instead of returning CALL_BUSY forever", async () => {
    const token = await serviceToken();
    const staleAt = new Date(Date.now() - (env.CALL_RING_TIMEOUT_SECONDS + 1) * 1000);
    const stale = await CallModel.create({
      callerId: aliceId,
      calleeId: bobId,
      conversationId: null,
      type: "voice",
      status: "ringing",
      initiatedAt: staleAt,
      answeredAt: null,
      endedAt: null,
      durationSeconds: null,
      endedBy: null,
      endReason: null,
      callerSessionId: "alice-session",
      acceptedBySessionId: null,
      createdAt: staleAt,
      updatedAt: staleAt,
    });

    const retry = await request(app).post("/internal/realtime/calls/start").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ calleeId: bobId, type: "voice" });
    expect(retry.status).toBe(201);
    expect((await CallModel.findById(stale._id).lean().exec())?.status).toBe("missed");
  });

  it("does not allow a third user to authorize signaling", async () => {
    const eve = await UserModel.create({ username: "eve", displayName: "Eve", avatarUrl: null, accountStatus: "active", badges: [] });
    await AuthSessionModel.create({ userId: eve._id, sessionId: "eve-session", revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    const eveToken = await accessToken(eve._id.toString(), "eve-session");
    const token = await serviceToken();
    const started = await request(app).post("/internal/realtime/calls/start").set("x-internal-service-token", token).set("Authorization", `Bearer ${aliceToken}`).send({ calleeId: bobId, type: "video" });
    const response = await request(app).post("/internal/realtime/calls/authorize-signal").set("x-internal-service-token", token).set("Authorization", `Bearer ${eveToken}`).send({ callId: started.body.data.call.id, kind: "offer" });
    expect(response.status).toBe(404);
  });
});
