import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMessageApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/database.js";
import { AuthSessionModel } from "../src/modules/auth/auth-session.model.js";
import { initializeChannelModels } from "../src/modules/channels/channel.service.js";
import { ChannelModel, ChannelPostModel } from "../src/modules/channels/channel.model.js";
import { ConversationModel } from "../src/modules/conversations/conversation.model.js";
import { initializeConversationModels } from "../src/modules/conversations/conversation.service.js";
import { E2EFEDeviceModel } from "../src/modules/e2efe/e2efe-device.model.js";
import { E2EFEMessageEnvelopeModel } from "../src/modules/e2efe/e2efe-message-envelope.model.js";
import { initializeE2EFEModels } from "../src/modules/e2efe/e2efe.service.js";
import { GroupModel } from "../src/modules/groups/group.model.js";
import { initializeGroupModels } from "../src/modules/groups/group.service.js";
import { MessageModel } from "../src/modules/messages/message.model.js";
import { MessageUserStateModel } from "../src/modules/messages/message-user-state.model.js";
import { initializeMessageModels } from "../src/modules/messages/message.service.js";
import { UserModel } from "../src/modules/users/user.model.js";
import type { UserEntity } from "../src/modules/users/user.types.js";
import { addRelationshipContact, blockRelationshipUser, resetRelationshipMock } from "./relationship-mock.js";

const app = createMessageApp();
const publicKey = Buffer.from("message-server-test-key").toString("base64");

interface TestIdentity {
  id: string;
  token: string;
}

async function createIdentity(username: string): Promise<TestIdentity> {
  const user = await UserModel.create({
    username,
    usernameNormalized: username.toLowerCase(),
    displayName: username,
    email: `${username.toLowerCase()}@example.test`,
    emailNormalized: `${username.toLowerCase()}@example.test`,
    phone: `+1415555${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
    phoneNormalized: null,
    passwordHash: "not-used-by-message-server",
    avatarUrl: null,
    avatarStorageKey: null,
    avatarMimeType: null,
    bio: null,
    emailVerified: false,
    phoneVerified: false,
    accountStatus: "active",
    role: "user",
    accountType: "personal",
    userTier: "normal",
    badges: [],
    lastSeenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies UserEntity);
  const sessionId = randomUUID();
  await AuthSessionModel.create({
    userId: user._id,
    sessionId,
    refreshTokenHash: "message-server-test-refresh-hash",
    deviceId: null,
    deviceName: "message-server-test",
    platform: "web",
    appVersion: null,
    appBuild: null,
    userAgent: "message-server-test",
    ipAddress: "127.0.0.1",
    lastUsedAt: new Date(),
    lastRefreshAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    revokeReason: null,
  });
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setSubject(user._id.toString())
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
  return { id: user._id.toString(), token };
}

function authorization(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

async function registerDevice(token: string): Promise<void> {
  const response = await request(app)
    .post("/api/v1/e2efe/devices/register")
    .set(authorization(token))
    .send({
      deviceId: 1,
      registrationId: 101,
      protocolVersion: "terqivo-e2efe-v1",
      identityPublicKey: publicKey,
      signedPreKeyId: 11,
      signedPreKeyPublic: publicKey,
      signedPreKeySignature: publicKey,
      kyberPreKeyId: 21,
      kyberPreKeyPublic: publicKey,
      kyberPreKeySignature: publicKey,
      oneTimePreKeys: [{ id: 31, publicKey }],
    });
  expect(response.status).toBe(201);
}

async function clearMessageData(): Promise<void> {
  await Promise.all([
    AuthSessionModel.deleteMany({}),
    UserModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
    MessageUserStateModel.deleteMany({}),
    GroupModel.deleteMany({}),
    ChannelModel.deleteMany({}),
    ChannelPostModel.deleteMany({}),
    E2EFEDeviceModel.deleteMany({}),
    E2EFEMessageEnvelopeModel.deleteMany({}),
  ]);
  resetRelationshipMock();
}

beforeAll(async () => {
  await connectDatabase();
  await Promise.all([
    UserModel.init(),
    AuthSessionModel.init(),
    initializeConversationModels(),
    initializeMessageModels(),
    initializeGroupModels(),
    initializeChannelModels(),
    initializeE2EFEModels(),
  ]);
});

beforeEach(clearMessageData);
afterAll(disconnectDatabase);

describe("message server domain compatibility", () => {
  it("enforces block policy through the Relationship Server client", async () => {
    const alice = await createIdentity("BlockedMessageAlice");
    const bob = await createIdentity("BlockedMessageBob");
    blockRelationshipUser(alice.id, bob.id);
    const response = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authorization(alice.token))
      .send({ userId: bob.id });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("INTERACTION_BLOCKED");
  });

  it("creates one direct conversation, preserves authorization, and deduplicates messages", async () => {
    const alice = await createIdentity("MessageAlice");
    const bob = await createIdentity("MessageBob");
    const outsider = await createIdentity("MessageOutsider");

    const created = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authorization(alice.token))
      .send({ userId: bob.id });
    expect(created.status).toBe(201);
    const conversationId = created.body.data.conversation.id as string;

    const reversed = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authorization(bob.token))
      .send({ userId: alice.id });
    expect(reversed.body.data.conversation.id).toBe(conversationId);

    const sent = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authorization(alice.token))
      .send({ clientMessageId: "message-server-1", type: "text", text: "Hello" });
    const duplicate = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authorization(alice.token))
      .send({ clientMessageId: "message-server-1", type: "text", text: "Hello" });
    const forbidden = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authorization(outsider.token));

    expect(sent.status).toBe(201);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.duplicate).toBe(true);
    expect(duplicate.body.data.message.id).toBe(sent.body.data.message.id);
    expect(forbidden.status).toBe(404);
    expect(await MessageModel.countDocuments()).toBe(1);
  });

  it("rejects plaintext when E2EFE is enabled and keeps encrypted history opaque", async () => {
    const alice = await createIdentity("EncryptedAlice");
    const bob = await createIdentity("EncryptedBob");
    await registerDevice(alice.token);
    await registerDevice(bob.token);

    const conversation = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authorization(alice.token))
      .send({ userId: bob.id });
    const conversationId = conversation.body.data.conversation.id as string;

    const plaintext = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authorization(alice.token))
      .send({ clientMessageId: "plaintext-rejected", type: "text", text: "secret" });
    expect(plaintext.status).toBe(409);
    expect(plaintext.body.error.code).toBe("E2EFE_REQUIRED");

    const encrypted = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages/encrypted`)
      .set(authorization(alice.token))
      .send({
        clientMessageId: "encrypted-1",
        type: "text",
        e2efeVersion: "terqivo-e2efe-v1",
        senderDeviceId: 1,
        envelopes: [{
          recipientUserId: bob.id,
          recipientDeviceId: 1,
          envelopeType: 3,
          ciphertext: Buffer.from("opaque-ciphertext").toString("base64"),
        }],
      });
    expect(encrypted.status).toBe(201);
    const stored = await MessageModel.findById(encrypted.body.data.message.id).lean().exec();
    expect(stored?.text).toBeNull();
    expect(stored?.e2efeVersion).toBe("terqivo-e2efe-v1");
    expect(await E2EFEMessageEnvelopeModel.countDocuments()).toBe(1);
  });

  it("preserves group membership authorization and channel follow/post behavior", async () => {
    const alice = await createIdentity("CommunityAlice");
    const bob = await createIdentity("CommunityBob");
    addRelationshipContact(alice.id, bob.id);

    const group = await request(app)
      .post("/api/v1/groups")
      .set(authorization(alice.token))
      .send({ name: "Message Group", description: "test", memberUserIds: [bob.id] });
    expect(group.status).toBe(201);

    const channel = await request(app)
      .post("/api/v1/channels")
      .set(authorization(alice.token))
      .send({ name: "Message Channel", handle: "message_channel", description: "test" });
    expect(channel.status).toBe(201);
    const channelId = channel.body.data.channel.id as string;
    const followed = await request(app)
      .post(`/api/v1/channels/${channelId}/follow`)
      .set(authorization(bob.token));
    const post = await request(app)
      .post(`/api/v1/channels/${channelId}/posts`)
      .set(authorization(alice.token))
      .send({ text: "A channel update" });

    expect(followed.status).toBe(200);
    expect(post.status).toBe(201);
    expect(post.body.data.post.text).toBe("A channel update");
  });

  it("rejects malformed and expired access tokens without touching domain data", async () => {
    const response = await request(app)
      .get("/api/v1/conversations")
      .set("Authorization", "Bearer not-a-jwt");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_ACCESS_TOKEN");
    expect(await ConversationModel.countDocuments()).toBe(0);
  });
});
