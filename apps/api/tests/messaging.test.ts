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

  it("persists one reaction per user and limits reaction changes to participants", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Reactions",
        name: "Bob Reactions",
        phone: "+14155550102",
        email: "bob-reactions@example.com",
      }),
    );
    const charlie = authData(
      await register({
        username: "Charlie.Reactions",
        name: "Charlie Reactions",
        phone: "+14155550103",
        email: "charlie-reactions@example.com",
      }),
    );
    const created = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = created.body.data.conversation.id as string;
    const sent = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(alice.accessToken))
      .send({
        clientMessageId: "reaction-message-1",
        type: "text",
        text: "React to me",
      });
    const messageId = sent.body.data.message.id as string;

    const first = await request(app)
      .put(`/api/v1/messages/${messageId}/reaction`)
      .set(authHeader(bob.accessToken))
      .send({ emoji: "❤️" });
    const replaced = await request(app)
      .put(`/api/v1/messages/${messageId}/reaction`)
      .set(authHeader(bob.accessToken))
      .send({ emoji: "👍" });
    const removed = await request(app)
      .delete(`/api/v1/messages/${messageId}/reaction`)
      .set(authHeader(bob.accessToken));
    const forbidden = await request(app)
      .put(`/api/v1/messages/${messageId}/reaction`)
      .set(authHeader(charlie.accessToken))
      .send({ emoji: "😂" });

    expect(first.status).toBe(200);
    expect(first.body.data.message.reactions).toHaveLength(1);
    expect(first.body.data.message.reactions[0].emoji).toBe("❤️");
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.message.reactions).toHaveLength(1);
    expect(replaced.body.data.message.reactions[0].emoji).toBe("👍");
    expect(removed.status).toBe(200);
    expect(removed.body.data.message.reactions).toEqual([]);
    expect(forbidden.status).toBe(404);
  });

  it("clears history and mute state for one participant only", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Actions",
        name: "Bob Actions",
        phone: "+14155550102",
        email: "bob-actions@example.com",
      }),
    );
    const created = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = created.body.data.conversation.id as string;
    await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(alice.accessToken))
      .send({
        clientMessageId: "actions-message-1",
        type: "text",
        text: "Keep this private to the other participant",
      });

    const mute = await request(app)
      .put(`/api/v1/conversations/${conversationId}/mute`)
      .set(authHeader(bob.accessToken))
      .send({ duration: "8h" });
    const clear = await request(app)
      .post(`/api/v1/conversations/${conversationId}/clear`)
      .set(authHeader(bob.accessToken));
    const bobHistory = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(bob.accessToken));
    const aliceHistory = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(alice.accessToken));
    const bobList = await request(app)
      .get("/api/v1/conversations")
      .set(authHeader(bob.accessToken));
    const aliceList = await request(app)
      .get("/api/v1/conversations")
      .set(authHeader(alice.accessToken));

    expect(mute.status).toBe(200);
    expect(clear.status).toBe(200);
    expect(bobHistory.body.data.messages).toEqual([]);
    expect(aliceHistory.body.data.messages).toHaveLength(1);
    expect(bobList.body.data.conversations[0]).toMatchObject({
      muted: true,
      lastMessage: null,
    });
    expect(aliceList.body.data.conversations[0].lastMessage.text).toBe(
      "Keep this private to the other participant",
    );
  });

  it("enforces a direct-user block for new messages and conversations", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Blocked",
        name: "Bob Blocked",
        phone: "+14155550102",
        email: "bob-blocked@example.com",
      }),
    );
    const created = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = created.body.data.conversation.id as string;
    const blocked = await request(app)
      .put(`/api/v1/users/${bob.user.id}/block`)
      .set(authHeader(alice.accessToken));
    const message = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(alice.accessToken))
      .send({
        clientMessageId: "blocked-message-1",
        type: "text",
        text: "This should not send",
      });
    const newConversation = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(bob.accessToken))
      .send({ userId: alice.user.id });
    const unblocked = await request(app)
      .delete(`/api/v1/users/${bob.user.id}/block`)
      .set(authHeader(alice.accessToken));

    expect(blocked.status).toBe(200);
    expect(message.status).toBe(403);
    expect(newConversation.status).toBe(403);
    expect(unblocked.status).toBe(200);
  });
});
