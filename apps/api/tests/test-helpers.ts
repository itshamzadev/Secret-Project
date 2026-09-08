import type { Response } from "supertest";

import { env } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/database.js";
import { disconnectRedis, redisClient } from "../src/lib/redis.js";
import { initializeAuthModels } from "../src/modules/auth/auth.service.js";
import { AuthSessionModel } from "../src/modules/auth/auth-session.model.js";
import { initializeContactModels } from "../src/modules/contacts/contact.service.js";
import { ContactModel } from "../src/modules/contacts/contact.model.js";
import { initializeConversationModels } from "../src/modules/conversations/conversation.service.js";
import { ConversationModel } from "../src/modules/conversations/conversation.model.js";
import { initializeMessageModels } from "../src/modules/messages/message.service.js";
import { MessageModel } from "../src/modules/messages/message.model.js";
import { MessageUserStateModel } from "../src/modules/messages/message-user-state.model.js";
import { UserModel } from "../src/modules/users/user.model.js";
import { initializePresenceModels } from "../src/modules/users/presence.service.js";
import { UserPresenceSessionModel } from "../src/modules/users/user-presence-session.model.js";
import { CallModel } from "../src/modules/calls/call.model.js";
import { initializeCallModels } from "../src/modules/calls/call.service.js";
import { callTimeoutKeys } from "../src/modules/calls/call-timeouts.js";
import { PushDeviceModel } from "../src/modules/notifications/push-device.model.js";
import { initializeNotificationModels } from "../src/modules/notifications/notification.service.js";
import { UserBlockModel } from "../src/modules/privacy/block.model.js";
import { initializeBlockModels } from "../src/modules/privacy/block.service.js";
import { initializeE2EFEModels } from "../src/modules/e2efe/e2efe.service.js";
import { E2EFEDeviceModel } from "../src/modules/e2efe/e2efe-device.model.js";
import { E2EFEMessageEnvelopeModel } from "../src/modules/e2efe/e2efe-message-envelope.model.js";
import { E2EFEStagedMediaModel } from "../src/modules/media/e2efe-media-upload.model.js";
import { initializeMediaModels } from "../src/modules/media/media.service.js";
import { GroupModel } from "../src/modules/groups/group.model.js";
import { initializeGroupModels } from "../src/modules/groups/group.service.js";
import { ChannelModel, ChannelPostModel } from "../src/modules/channels/channel.model.js";
import { initializeChannelModels } from "../src/modules/channels/channel.service.js";
import { StatusModel } from "../src/modules/status/status.model.js";
import { initializeStatusModels } from "../src/modules/status/status.service.js";

export interface TestRegisterPayload {
  username: string;
  name: string;
  phone: string;
  email?: string;
  password: string;
  deviceId?: string;
  deviceName?: string;
  platform?:
    "web" | "android" | "ios" | "windows" | "macos" | "linux" | "unknown";
}

export interface TestAuthData {
  user: {
    id: string;
    username: string;
    displayName: string;
    email: string | null;
    phone: string;
  };
  session: { id: string };
  accessToken: string;
  refreshToken: string;
}

export function authData(response: Response): TestAuthData {
  return response.body.data as TestAuthData;
}

export function registerPayload(
  overrides: Partial<TestRegisterPayload> = {},
): TestRegisterPayload {
  return {
    username: "Alice.Example",
    name: "Alice Example",
    phone: "+14155550101",
    email: "alice@example.com",
    password: "correct horse battery staple",
    platform: "web",
    ...overrides,
  };
}

export function authHeader(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function connectTestData(): Promise<void> {
  if (
    env.NODE_ENV !== "test" ||
    !env.MONGODB_URI.includes("terqivo_connect_test")
  ) {
    throw new Error(
      "Tests require the dedicated terqivo_connect_test database",
    );
  }
  await connectDatabase();
  await initializeAuthModels();
  await initializeContactModels();
  await initializeConversationModels();
  await initializeMessageModels();
  await initializePresenceModels();
  await initializeCallModels();
  await initializeNotificationModels();
  await initializeBlockModels();
  await initializeE2EFEModels();
  await initializeMediaModels();
  await initializeGroupModels();
  await initializeChannelModels();
  await initializeStatusModels();
}

export async function clearTestData(): Promise<void> {
  await Promise.all([
    MessageModel.deleteMany({}),
    MessageUserStateModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    ContactModel.deleteMany({}),
    AuthSessionModel.deleteMany({}),
    UserPresenceSessionModel.deleteMany({}),
    CallModel.deleteMany({}),
    PushDeviceModel.deleteMany({}),
    UserModel.deleteMany({}),
    UserBlockModel.deleteMany({}),
    E2EFEDeviceModel.deleteMany({}),
    E2EFEMessageEnvelopeModel.deleteMany({}),
    E2EFEStagedMediaModel.deleteMany({}),
    GroupModel.deleteMany({}),
    ChannelModel.deleteMany({}),
    ChannelPostModel.deleteMany({}),
    StatusModel.deleteMany({}),
  ]);
  if (redisClient.isReady) {
    await redisClient.del(callTimeoutKeys.timeoutSetKey);
  }
}

export async function disconnectTestData(): Promise<void> {
  await clearTestData();
  await disconnectDatabase();
  await disconnectRedis();
}
