import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { E2EFEDeviceModel } from "../src/modules/e2efe/e2efe-device.model.js";
import { E2EFEMessageEnvelopeModel } from "../src/modules/e2efe/e2efe-message-envelope.model.js";
import { E2EFEStagedMediaModel } from "../src/modules/media/e2efe-media-upload.model.js";
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
const publicKey = Buffer.from("terqivo-public-key").toString("base64");
const signature = Buffer.from("terqivo-signature").toString("base64");

async function register(overrides: Parameters<typeof registerPayload>[0] = {}) {
  return request(app)
    .post("/api/v1/auth/register")
    .send(registerPayload(overrides));
}

async function registerDevice(
  accessToken: string,
  deviceId: number,
): Promise<void> {
  const response = await request(app)
    .post("/api/v1/e2efe/devices/register")
    .set(authHeader(accessToken))
    .send({
      deviceId,
      registrationId: 100 + deviceId,
      protocolVersion: "terqivo-e2efe-v1",
      identityPublicKey: publicKey,
      signedPreKeyId: 10 + deviceId,
      signedPreKeyPublic: publicKey,
      signedPreKeySignature: signature,
      kyberPreKeyId: 20 + deviceId,
      kyberPreKeyPublic: publicKey,
      kyberPreKeySignature: signature,
      oneTimePreKeys: [{ id: 30 + deviceId, publicKey }],
    });
  expect(response.status).toBe(201);
}

describe("E2EFE encrypted message transport", () => {
  beforeAll(connectTestData);
  beforeEach(clearTestData);
  afterAll(disconnectTestData);

  it("stores and returns ciphertext without accepting message plaintext", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Encrypted",
        name: "Bob Encrypted",
        phone: "+14155550102",
        email: "bob-encrypted@example.com",
      }),
    );
    await registerDevice(alice.accessToken, 1);
    await registerDevice(bob.accessToken, 1);

    const conversation = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = conversation.body.data.conversation.id as string;
    const ciphertext = Buffer.from("encrypted-envelope-only").toString(
      "base64",
    );
    const sent = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages/encrypted`)
      .set(authHeader(alice.accessToken))
      .send({
        clientMessageId: "e2efe-message-1",
        type: "text",
        e2efeVersion: "terqivo-e2efe-v1",
        senderDeviceId: 1,
        envelopes: [
          {
            recipientUserId: bob.user.id,
            recipientDeviceId: 1,
            envelopeType: 3,
            ciphertext,
          },
        ],
      });
    const repeated = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages/encrypted`)
      .set(authHeader(alice.accessToken))
      .send({
        clientMessageId: "e2efe-message-1",
        type: "text",
        e2efeVersion: "terqivo-e2efe-v1",
        senderDeviceId: 1,
        envelopes: [
          {
            recipientUserId: bob.user.id,
            recipientDeviceId: 1,
            envelopeType: 3,
            ciphertext,
          },
        ],
      });

    expect(sent.status).toBe(201);
    expect(sent.body.data.message.text).toBeNull();
    expect(sent.body.data.message.e2efeVersion).toBe("terqivo-e2efe-v1");
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.duplicate).toBe(true);
    expect(await E2EFEMessageEnvelopeModel.countDocuments()).toBe(1);

    const stored = await E2EFEMessageEnvelopeModel.findOne().lean().exec();
    expect(JSON.stringify(stored)).not.toContain(
      "TERQIVO_E2EFE_SECRET_91F3A7C4",
    );

    const history = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .query({ e2efeDeviceId: 1 })
      .set(authHeader(bob.accessToken));
    expect(history.status).toBe(200);
    expect(history.body.data.messages[0]).toMatchObject({
      text: null,
      e2efeVersion: "terqivo-e2efe-v1",
      encryptedEnvelope: { ciphertext, recipientUserId: bob.user.id },
    });

    const revisionCiphertext = Buffer.from("encrypted-revision-only").toString(
      "base64",
    );
    const edited = await request(app)
      .patch(`/api/v1/messages/${sent.body.data.message.id}/encrypted`)
      .set(authHeader(alice.accessToken))
      .send({
        revisionId: "e2efe-revision-1",
        e2efeVersion: "terqivo-e2efe-v1",
        senderDeviceId: 1,
        envelopes: [
          {
            recipientUserId: bob.user.id,
            recipientDeviceId: 1,
            envelopeType: 3,
            ciphertext: revisionCiphertext,
          },
        ],
      });

    expect(edited.status).toBe(200);
    expect(edited.body.data.message.text).toBeNull();
    expect(edited.body.data.message.editedAt).toEqual(expect.any(String));
    expect(
      await MessageModel.countDocuments({
        e2efeRevisionId: "e2efe-revision-1",
      }),
    ).toBe(1);
    expect(
      (await E2EFEMessageEnvelopeModel.findOne().lean().exec())?.ciphertext,
    ).toBe(revisionCiphertext);
  });

  it("does not allow an unauthenticated ciphertext submission", async () => {
    const response = await request(app)
      .post("/api/v1/conversations/000000000000000000000000/messages/encrypted")
      .send({});
    expect(response.status).toBe(401);
  });

  it("stores encrypted media as ciphertext-only staging plus an encrypted message", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.EncryptedMedia",
        name: "Bob Encrypted Media",
        phone: "+14155550104",
        email: "bob-encrypted-media@example.com",
      }),
    );
    await registerDevice(alice.accessToken, 1);
    await registerDevice(bob.accessToken, 1);
    const conversation = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = conversation.body.data.conversation.id as string;
    const ciphertext = Buffer.from("ciphertext-only-media");

    const staged = await request(app)
      .post(`/api/v1/conversations/${conversationId}/media/encrypted/upload`)
      .query({ clientMessageId: "e2efe-media-1", type: "image" })
      .set(authHeader(alice.accessToken))
      .set("Content-Type", "application/octet-stream")
      .set("x-file-name", "encrypted-media.bin")
      .send(ciphertext);

    expect(staged.status).toBe(201);
    const stagedData = staged.body.data as { storageKey: string; size: number };
    expect(stagedData.size).toBe(ciphertext.length);
    expect(await E2EFEStagedMediaModel.countDocuments()).toBe(1);

    const finalized = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages/encrypted-media`)
      .set(authHeader(alice.accessToken))
      .send({
        clientMessageId: "e2efe-media-1",
        type: "image",
        e2efeVersion: "terqivo-e2efe-v1",
        senderDeviceId: 1,
        media: stagedData,
        envelopes: [
          {
            recipientUserId: bob.user.id,
            recipientDeviceId: 1,
            envelopeType: 3,
            ciphertext: Buffer.from("signal-protected-media-key").toString(
              "base64",
            ),
          },
        ],
      });

    expect(finalized.status).toBe(201);
    expect(finalized.body.data.message).toMatchObject({
      text: null,
      type: "image",
      media: {
        encrypted: true,
        encryptionVersion: "aes-256-gcm-v1",
        storageKey: stagedData.storageKey,
        mimeType: "application/octet-stream",
      },
    });
    const storedMessage = await MessageModel.findOne({
      clientMessageId: "e2efe-media-1",
    })
      .lean()
      .exec();
    expect(JSON.stringify(storedMessage)).not.toContain(
      "TERQIVO_MEDIA_SECRET_91F3A7C4",
    );
    expect(JSON.stringify(storedMessage)).not.toContain(
      "ciphertext-only-media",
    );

    const mediaUrl = finalized.body.data.message.media.url as string;
    const download = await request(app)
      .get(mediaUrl)
      .set(authHeader(bob.accessToken));
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain(
      "application/octet-stream",
    );
    expect(download.body).toEqual(ciphertext);
  });

  it("rejects the legacy plaintext path once both participants have E2EFE devices", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.PlaintextCutoff",
        name: "Bob Plaintext Cutoff",
        phone: "+14155550103",
        email: "bob-plaintext-cutoff@example.com",
      }),
    );
    await registerDevice(alice.accessToken, 1);
    await registerDevice(bob.accessToken, 1);
    const conversation = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });

    const response = await request(app)
      .post(
        `/api/v1/conversations/${conversation.body.data.conversation.id}/messages`,
      )
      .set(authHeader(alice.accessToken))
      .send({
        clientMessageId: "legacy-plaintext-after-e2efe",
        type: "text",
        text: "This must not enter an encrypted conversation.",
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("E2EFE_REQUIRED");
  });

  it("does not reset consumed one-time prekeys during re-registration", async () => {
    const alice = authData(await register());
    await registerDevice(alice.accessToken, 1);

    await E2EFEDeviceModel.updateOne(
      { userId: alice.user.id, deviceId: 1 },
      { $pop: { oneTimePreKeys: 1 } },
    ).exec();
    expect(
      (
        await E2EFEDeviceModel.findOne({ userId: alice.user.id, deviceId: 1 })
          .lean()
          .exec()
      )?.oneTimePreKeys,
    ).toHaveLength(0);

    await registerDevice(alice.accessToken, 1);
    expect(
      (
        await E2EFEDeviceModel.findOne({ userId: alice.user.id, deviceId: 1 })
          .lean()
          .exec()
      )?.oneTimePreKeys,
    ).toHaveLength(0);
  });
});
