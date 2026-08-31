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
import { UserModel } from "../src/modules/users/user.model.js";
import { initializePresenceModels } from "../src/modules/users/presence.service.js";
import { UserPresenceSessionModel } from "../src/modules/users/user-presence-session.model.js";
import { CallModel } from "../src/modules/calls/call.model.js";
import { initializeCallModels } from "../src/modules/calls/call.service.js";
import { callTimeoutKeys } from "../src/modules/calls/call-timeouts.js";

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
}

export async function clearTestData(): Promise<void> {
  await Promise.all([
    MessageModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    ContactModel.deleteMany({}),
    AuthSessionModel.deleteMany({}),
    UserPresenceSessionModel.deleteMany({}),
    CallModel.deleteMany({}),
    UserModel.deleteMany({}),
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
