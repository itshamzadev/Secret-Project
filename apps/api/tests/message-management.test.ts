import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { ConversationModel } from "../src/modules/conversations/conversation.model.js";
import { MessageModel } from "../src/modules/messages/message.model.js";
import { MessageUserStateModel } from "../src/modules/messages/message-user-state.model.js";
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

async function createFixture() {
  const alice = authData(await register());
  const bob = authData(
    await register({
      username: "Bob.Management",
      name: "Bob Management",
      phone: "+14155550102",
      email: "bob-management@example.com",
    }),
  );
  const created = await request(app)
    .post("/api/v1/conversations/direct")
    .set(authHeader(alice.accessToken))
    .send({ userId: bob.user.id });
  return {
    alice,
    bob,
    conversationId: created.body.data.conversation.id as string,
  };
}

async function sendText(
  conversationId: string,
  accessToken: string,
  clientMessageId: string,
  text: string,
) {
  return request(app)
    .post(`/api/v1/conversations/${conversationId}/messages`)
    .set(authHeader(accessToken))
    .send({ clientMessageId, type: "text", text });
}

describe("message management", () => {
  beforeAll(connectTestData);
  beforeEach(clearTestData);
  afterAll(disconnectTestData);

  it("edits only the sender's text message and preserves its creation time", async () => {
    const { alice, bob, conversationId } = await createFixture();
    const sent = await sendText(
      conversationId,
      alice.accessToken,
      "edit-1",
      "Before",
    );
    const messageId = sent.body.data.message.id as string;
    const createdAt = sent.body.data.message.createdAt as string;

    const edited = await request(app)
      .patch(`/api/v1/messages/${messageId}`)
      .set(authHeader(alice.accessToken))
      .send({ text: "After" });
    const forbidden = await request(app)
      .patch(`/api/v1/messages/${messageId}`)
      .set(authHeader(bob.accessToken))
      .send({ text: "Not yours" });

    expect(edited.status).toBe(200);
    expect(edited.body.data.message).toMatchObject({
      text: "After",
      createdAt,
    });
    expect(edited.body.data.message.editedAt).toEqual(expect.any(String));
    expect(forbidden.status).toBe(403);
  });

  it("keeps delete-for-me and favorites personal while synchronizing shared deletion", async () => {
    const { alice, bob, conversationId } = await createFixture();
    const sent = await sendText(
      conversationId,
      alice.accessToken,
      "state-1",
      "Private state",
    );
    const messageId = sent.body.data.message.id as string;

    const favorite = await request(app)
      .put(`/api/v1/messages/${messageId}/favorite`)
      .set(authHeader(alice.accessToken));
    const bobBeforeDelete = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(bob.accessToken));
    const deletedForMe = await request(app)
      .delete(`/api/v1/messages/${messageId}/for-me`)
      .set(authHeader(alice.accessToken));
    const aliceAfterDelete = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(alice.accessToken));
    const bobAfterDeleteForMe = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(bob.accessToken));
    const globallyDeleted = await request(app)
      .delete(`/api/v1/messages/${messageId}/for-everyone`)
      .set(authHeader(alice.accessToken));
    const bobAfterGlobalDelete = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(bob.accessToken));

    expect(favorite.status).toBe(200);
    expect(bobBeforeDelete.body.data.messages[0].isFavorite).toBe(false);
    expect(deletedForMe.status).toBe(200);
    expect(aliceAfterDelete.body.data.messages).toHaveLength(0);
    expect(bobAfterDeleteForMe.body.data.messages).toHaveLength(1);
    const recipientCannotDeleteEveryone = await request(app)
      .delete(`/api/v1/messages/${messageId}/for-everyone`)
      .set(authHeader(bob.accessToken));
    expect(globallyDeleted.status).toBe(200);
    expect(recipientCannotDeleteEveryone.status).toBe(403);
    expect(bobAfterGlobalDelete.body.data.messages[0]).toMatchObject({
      isDeletedForEveryone: true,
      text: null,
      media: null,
    });
    expect(await MessageUserStateModel.countDocuments({ messageId })).toBe(1);
  });

  it("supports personal and shared pins and preserves favorites when clearing", async () => {
    const { alice, bob, conversationId } = await createFixture();
    const favoriteResponse = await sendText(
      conversationId,
      alice.accessToken,
      "favorite-1",
      "Keep this favorite",
    );
    const otherResponse = await sendText(
      conversationId,
      alice.accessToken,
      "other-1",
      "Clear this one",
    );
    const favoriteId = favoriteResponse.body.data.message.id as string;
    const otherId = otherResponse.body.data.message.id as string;

    await request(app)
      .put(`/api/v1/messages/${favoriteId}/favorite`)
      .set(authHeader(alice.accessToken));
    const personalPin = await request(app)
      .put(`/api/v1/messages/${favoriteId}/pin`)
      .set(authHeader(alice.accessToken))
      .send({ scope: "me" });
    const bobAfterPersonalPin = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(bob.accessToken));
    const sharedPin = await request(app)
      .put(`/api/v1/messages/${otherId}/pin`)
      .set(authHeader(alice.accessToken))
      .send({ scope: "everyone" });
    const bobAfterSharedPin = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(bob.accessToken));
    const clear = await request(app)
      .post(`/api/v1/conversations/${conversationId}/clear`)
      .set(authHeader(alice.accessToken))
      .send({ keepFavorites: true });
    const aliceAfterClear = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(alice.accessToken));
    const aliceConversationListAfterClear = await request(app)
      .get("/api/v1/conversations")
      .set(authHeader(alice.accessToken));
    const bobAfterClear = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(bob.accessToken));

    expect(personalPin.status).toBe(200);
    expect(bobAfterPersonalPin.body.data.messages[0].isPinnedForMe).toBe(false);
    expect(sharedPin.status).toBe(200);
    expect(
      bobAfterSharedPin.body.data.messages.find(
        (message: { id: string }) => message.id === otherId,
      ).isPinnedForEveryone,
    ).toBe(true);
    expect(clear.status).toBe(200);
    expect(aliceAfterClear.body.data.messages).toHaveLength(1);
    expect(aliceAfterClear.body.data.messages[0]).toMatchObject({
      id: favoriteId,
      isFavorite: true,
      isPinnedForMe: false,
    });
    expect(
      aliceConversationListAfterClear.body.data.conversations[0],
    ).toMatchObject({
      id: conversationId,
      lastMessage: { id: favoriteId, isFavorite: true },
    });
    expect(bobAfterClear.body.data.messages).toHaveLength(2);
    expect(await MessageModel.countDocuments({ conversationId })).toBe(2);
    expect(await ConversationModel.countDocuments()).toBe(1);
  });
});
