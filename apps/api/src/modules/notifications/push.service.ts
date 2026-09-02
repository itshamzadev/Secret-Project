import type { CallType, MessageDto } from "@terqivo/contracts";

import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { redisClient } from "../../lib/redis.js";
import type { UserDocument } from "../users/user.types.js";
import { getUserById } from "../users/user.service.js";
import {
  getEnabledPushDevices,
  disablePushTokens,
} from "./notification.service.js";
import type { CallDocument } from "../calls/call.types.js";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: "default";
  priority: "high";
  channelId: "messages" | "calls";
}

interface MessagePushInput {
  message: MessageDto;
  recipientId: string;
  senderId: string;
}

interface MessagePayloadInput {
  message: MessageDto;
  sender: Pick<UserDocument, "displayName" | "username">;
}

const pushDeduplicationTtlSeconds = 86_400;
const expoBatchSize = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function notificationPreview(message: MessageDto): string {
  if (message.type !== "text") return "New message";
  const preview = message.text.replace(/\s+/g, " ").trim();
  return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview;
}

export function buildMessagePushPayload(
  token: string,
  input: MessagePayloadInput,
): ExpoPushMessage {
  return {
    to: token,
    title: input.sender.displayName,
    body: notificationPreview(input.message),
    data: {
      type: "message",
      conversationId: input.message.conversationId,
      senderId: input.message.senderId,
    },
    sound: "default",
    priority: "high",
    channelId: "messages",
  };
}

export function buildIncomingCallPushPayload(
  token: string,
  call: Pick<CallDocument, "_id" | "type" | "callerId" | "calleeId">,
  caller: Pick<UserDocument, "displayName">,
): ExpoPushMessage {
  const callType: CallType = call.type;
  return {
    to: token,
    title: `Incoming ${callType} call`,
    body: `${caller.displayName} is calling you`,
    data: {
      type: "incoming_call",
      callId: call._id.toString(),
      callerId: call.callerId.toString(),
      callType,
    },
    sound: "default",
    priority: "high",
    channelId: "calls",
  };
}

export function invalidPushTokensFromResponse(
  tokens: string[],
  response: unknown,
): string[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return [];
  return response.data.flatMap((ticket: unknown, index: number) => {
    if (!isRecord(ticket) || ticket.status !== "error") return [];
    const details = isRecord(ticket.details) ? ticket.details : undefined;
    return details?.error === "DeviceNotRegistered" &&
      tokens[index] !== undefined
      ? [tokens[index]]
      : [];
  });
}

async function claimPush(key: string): Promise<boolean> {
  if (!redisClient.isReady) return true;
  const result = await redisClient.set(key, "1", {
    NX: true,
    EX: pushDeduplicationTtlSeconds,
  });
  return result === "OK";
}

async function sendExpoBatch(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.EXPO_ACCESS_TOKEN !== undefined) {
    headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
  }
  const response = await fetch(env.EXPO_PUSH_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
  });
  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    // The status still determines whether this delivery attempt succeeded.
  }
  if (!response.ok) {
    throw new Error(`Expo push service returned HTTP ${response.status}.`);
  }
  await disablePushTokens(
    invalidPushTokensFromResponse(
      deviceTokensFromMessages(messages),
      responseBody,
    ),
  );
}

function deviceTokensFromMessages(messages: ExpoPushMessage[]): string[] {
  return messages.map((message) => message.to);
}

async function sendPushMessages(messages: ExpoPushMessage[]): Promise<void> {
  for (let index = 0; index < messages.length; index += expoBatchSize) {
    await sendExpoBatch(messages.slice(index, index + expoBatchSize));
  }
}

export async function dispatchNewDirectMessage(
  input: MessagePushInput,
): Promise<void> {
  try {
    if (!(await claimPush(`terqivo:push:message:${input.message.id}`))) return;
    const [devices, sender] = await Promise.all([
      getEnabledPushDevices(input.recipientId),
      getUserById(input.senderId),
    ]);
    if (sender === null) return;
    await sendPushMessages(
      devices.map((device) =>
        buildMessagePushPayload(device.pushToken, {
          message: input.message,
          sender,
        }),
      ),
    );
  } catch (error: unknown) {
    logger.warn({ err: error }, "Direct message push delivery failed");
  }
}

export async function dispatchIncomingCallNotification(
  call: CallDocument,
  caller: UserDocument,
): Promise<void> {
  try {
    if (!(await claimPush(`terqivo:push:call:${call._id.toString()}`))) return;
    const devices = await getEnabledPushDevices(call.calleeId.toString());
    await sendPushMessages(
      devices.map((device) =>
        buildIncomingCallPushPayload(device.pushToken, call, caller),
      ),
    );
  } catch (error: unknown) {
    logger.warn({ err: error }, "Incoming call push delivery failed");
  }
}
