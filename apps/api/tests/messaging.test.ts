import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { ConversationModel } from "../src/modules/conversations/conversation.model.js";
import {
  authData,
  authHeader,
  clearTestData,
  connectTestData,
  disconnectTestData,
  registerPayload,
} from "./test-helpers.js";

const app = createApp();

async function register(overrides: Parameters<typeof registerPayload>[0] = {}) {
  return request(app)
    .post("/api/v1/auth/register")
    .send(registerPayload(overrides));
}

describe("direct conversations and messages", () => {
  beforeAll(connectTestData);
  beforeEach(clearTestData);
  afterAll(disconnectTestData);

  it("uses one deterministic direct conversation and idempotent text messages", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );
    const first = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });
    const reversed = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(bob.accessToken))
      .send({ userId: alice.user.id });
    const conversationId = first.body.data.conversation.id as string;

    const sent = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(alice.accessToken))
      .send({
        clientMessageId: "alice-message-1",
        type: "text",
        text: "Hello Bob",
      });
    const repeated = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(alice.accessToken))
      .send({
        clientMessageId: "alice-message-1",
        type: "text",
        text: "Hello Bob",
      });
    const history = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(bob.accessToken));
    const bobConversations = await request(app)
      .get("/api/v1/conversations")
      .set(authHeader(bob.accessToken));

    expect(first.status).toBe(201);
    expect(reversed.status).toBe(201);
    expect(reversed.body.data.conversation.id).toBe(conversationId);
    expect(await ConversationModel.countDocuments()).toBe(1);
    expect(sent.status).toBe(201);
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.duplicate).toBe(true);
    expect(repeated.body.data.message.id).toBe(sent.body.data.message.id);
    expect(history.body.data.messages).toHaveLength(1);
    expect(history.body.data.messages[0]).toMatchObject({
      text: "Hello Bob",
      status: "sent",
    });
    expect(bobConversations.body.data.conversations[0].unreadCount).toBe(1);

    const read = await request(app)
      .post(`/api/v1/conversations/${conversationId}/read`)
      .set(authHeader(bob.accessToken))
      .send({ lastReadMessageId: sent.body.data.message.id });
    const aliceHistory = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(alice.accessToken));
    const bobAfterRead = await request(app)
      .get("/api/v1/conversations")
      .set(authHeader(bob.accessToken));

    expect(read.status).toBe(200);
    expect(read.body.data.receipt.unreadCount).toBe(0);
    expect(aliceHistory.body.data.messages[0].status).toBe("read");
    expect(bobAfterRead.body.data.conversations[0].unreadCount).toBe(0);
  });

  it("does not expose a conversation to another user", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );
    const charlie = authData(
      await register({
        username: "Charlie.Example",
        name: "Charlie Example",
        phone: "+14155550103",
        email: "charlie@example.com",
      }),
    );
    const created = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });

    const response = await request(app)
      .get(
        `/api/v1/conversations/${created.body.data.conversation.id}/messages`,
      )
      .set(authHeader(charlie.accessToken));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CONVERSATION_NOT_FOUND");
  });
});
