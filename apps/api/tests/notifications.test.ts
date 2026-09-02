import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  buildIncomingCallPushPayload,
  buildMessagePushPayload,
  invalidPushTokensFromResponse,
} from "../src/modules/notifications/push.service.js";
import { disablePushTokens } from "../src/modules/notifications/notification.service.js";
import { PushDeviceModel } from "../src/modules/notifications/push-device.model.js";
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

describe("push notification devices and payloads", () => {
  beforeAll(connectTestData);
  beforeEach(clearTestData);
  afterAll(disconnectTestData);

  it("registers one authenticated device per Expo push token and enforces ownership on removal", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );
    const token = "ExponentPushToken[shared-device-token]";

    const first = await request(app)
      .post("/api/v1/notifications/devices")
      .set(authHeader(alice.accessToken))
      .send({ pushToken: token, platform: "android", deviceId: "android-1" });
    const second = await request(app)
      .post("/api/v1/notifications/devices")
      .set(authHeader(alice.accessToken))
      .send({ pushToken: token, platform: "android", deviceId: "android-1" });
    const countAfterDuplicate = await PushDeviceModel.countDocuments({});
    const wrongOwner = await request(app)
      .delete("/api/v1/notifications/devices")
      .set(authHeader(bob.accessToken))
      .send({ pushToken: token });
    const removed = await request(app)
      .delete("/api/v1/notifications/devices")
      .set(authHeader(alice.accessToken))
      .send({ pushToken: token });

    expect(first.status).toBe(200);
    expect(first.body.data.device).not.toHaveProperty("pushToken");
    expect(second.status).toBe(200);
    expect(countAfterDuplicate).toBe(1);
    expect(wrongOwner.body.data.removed).toBe(false);
    expect(removed.body.data.removed).toBe(true);
  });

  it("builds safe message and incoming-call notification metadata", () => {
    const message = {
      id: "message-1",
      conversationId: "conversation-1",
      senderId: "alice-1",
      clientMessageId: "client-1",
      type: "text" as const,
      text: "  Hello   from Terqivo  ",
      sequence: 1,
      status: "sent" as const,
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    };
    const messagePush = buildMessagePushPayload("ExponentPushToken[test]", {
      message,
      sender: { displayName: "Alice", username: "alice" },
    });
    const callPush = buildIncomingCallPushPayload(
      "ExponentPushToken[test]",
      {
        _id: new Types.ObjectId("68b6f3000000000000000001"),
        callerId: new Types.ObjectId("68b6f3000000000000000002"),
        calleeId: new Types.ObjectId("68b6f3000000000000000003"),
        type: "video",
      },
      { displayName: "Alice" },
    );

    expect(messagePush).toMatchObject({
      title: "Alice",
      body: "Hello from Terqivo",
      channelId: "messages",
      data: {
        type: "message",
        conversationId: "conversation-1",
        senderId: "alice-1",
      },
    });
    expect(callPush).toMatchObject({
      title: "Incoming video call",
      body: "Alice is calling you",
      channelId: "calls",
      priority: "high",
      data: { type: "incoming_call", callType: "video" },
    });
  });

  it("identifies invalid Expo tokens and disables them without exposing token data", async () => {
    const invalid = invalidPushTokensFromResponse(
      ["ExponentPushToken[valid]", "ExponentPushToken[invalid]"],
      {
        data: [
          { status: "ok" },
          { status: "error", details: { error: "DeviceNotRegistered" } },
        ],
      },
    );
    const invalidToken = invalid[0];
    if (invalidToken === undefined)
      throw new Error("Invalid token fixture missing.");
    await PushDeviceModel.create({
      userId: new Types.ObjectId(),
      pushToken: invalidToken,
      platform: "android",
      deviceId: null,
      enabled: true,
    });
    await disablePushTokens(invalid);

    expect(invalid).toEqual(["ExponentPushToken[invalid]"]);
    expect(
      (await PushDeviceModel.findOne({ pushToken: invalidToken }).exec())
        ?.enabled,
    ).toBe(false);
  });
});
