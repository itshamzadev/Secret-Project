import { rm, stat } from "node:fs/promises";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { MessageModel } from "../src/modules/messages/message.model.js";
import {
  authData,
  authHeader,
  clearTestData,
  connectTestData,
  disconnectTestData,
  registerPayload,
} from "./test-helpers.js";

const app = createApp();
const imageFixture = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082",
  "hex",
);

beforeAll(async () => {
  await connectTestData();
});

beforeEach(async () => {
  await clearTestData();
});

afterAll(async () => {
  await disconnectTestData();
  await rm(env.MEDIA_STORAGE_PATH, { recursive: true, force: true });
});

describe("media upload", () => {
  it("stores a valid image, creates a message, and serves it to participants", async () => {
    const alice = authData(
      await request(app).post("/api/v1/auth/register").send(registerPayload()),
    );
    const bob = authData(
      await request(app)
        .post("/api/v1/auth/register")
        .send(
          registerPayload({
            username: "Bob.Example",
            name: "Bob Example",
            phone: "+14155550102",
            email: "bob@example.com",
          }),
        ),
    );
    const conversation = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = conversation.body.data.conversation.id as string;

    const missingBody = await request(app)
      .post(`/api/v1/conversations/${conversationId}/media`)
      .query({ clientMessageId: "media-missing-body-1", type: "image" })
      .set(authHeader(alice.accessToken))
      .set("Content-Type", "image/png");
    expect(missingBody.status).toBe(400);
    expect(missingBody.body.error.code).toBe("MEDIA_BODY_REQUIRED");

    const invalidImage = await request(app)
      .post(`/api/v1/conversations/${conversationId}/media`)
      .query({ clientMessageId: "media-invalid-image-1", type: "image" })
      .set(authHeader(alice.accessToken))
      .set("Content-Type", "image/png")
      .send(Buffer.from("not an image"));
    expect(invalidImage.status).toBe(415);
    expect(invalidImage.body.error.code).toBe("MEDIA_TYPE_NOT_ALLOWED");

    const upload = await request(app)
      .post(`/api/v1/conversations/${conversationId}/media`)
      .query({
        clientMessageId: "media-image-test-1",
        type: "image",
        width: 1,
        height: 1,
      })
      .set(authHeader(alice.accessToken))
      .set("Content-Type", "image/png")
      .set("x-file-name", "test.png")
      .send(imageFixture);

    expect(upload.status).toBe(201);
    expect(upload.body.data.message.type).toBe("image");
    expect(upload.body.data.message.media).toMatchObject({
      mimeType: "image/png",
      size: imageFixture.length,
      fileName: "test.png",
    });

    const media = upload.body.data.message.media as {
      storageKey: string;
      url: string;
    };
    const stored = await stat(`${env.MEDIA_STORAGE_PATH}/${media.storageKey}`);
    expect(stored.size).toBe(imageFixture.length);
    expect(
      await MessageModel.countDocuments({
        clientMessageId: "media-image-test-1",
      }),
    ).toBe(1);

    const download = await request(app)
      .get(media.url)
      .set(authHeader(bob.accessToken));
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("image/png");
    expect(download.body).toEqual(imageFixture);
  });

  it("does not allow a non-participant to upload to a conversation", async () => {
    const alice = authData(
      await request(app).post("/api/v1/auth/register").send(registerPayload()),
    );
    const bob = authData(
      await request(app)
        .post("/api/v1/auth/register")
        .send(
          registerPayload({
            username: "Bob.Example",
            name: "Bob Example",
            phone: "+14155550102",
            email: "bob@example.com",
          }),
        ),
    );
    const outsider = authData(
      await request(app)
        .post("/api/v1/auth/register")
        .send(
          registerPayload({
            username: "Outsider.Example",
            name: "Outsider Example",
            phone: "+14155550103",
            email: "outsider@example.com",
          }),
        ),
    );
    const conversation = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = conversation.body.data.conversation.id as string;

    const response = await request(app)
      .post(`/api/v1/conversations/${conversationId}/media`)
      .query({ clientMessageId: "media-outsider-test-1", type: "image" })
      .set(authHeader(outsider.accessToken))
      .set("Content-Type", "image/png")
      .send(imageFixture);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CONVERSATION_NOT_FOUND");
  });
});
