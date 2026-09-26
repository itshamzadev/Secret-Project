import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";

import type { MessageDto } from "../../contracts/index.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { isConversationMuted } from "../conversations/conversation.service.js";
import { isUserBlockedEitherDirection } from "../privacy/block.service.js";
import { getUserById } from "../users/user.service.js";

interface MessagePushInput { message: MessageDto; recipientId: string; senderId: string; }

export function notificationPreview(message: Pick<MessageDto, "e2efeVersion" | "type" | "text">): string {
  if (message.e2efeVersion !== null && message.e2efeVersion !== undefined) return "New encrypted message";
  if (message.type === "image") return "Photo";
  if (message.type === "video") return "Video";
  if (message.type === "audio") return "Voice message";
  if (message.type === "file") return "File";
  const preview = message.text?.replace(/\s+/g, " ").trim() || "New message";
  return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview;
}

async function serviceToken(): Promise<string> {
  if (env.INTERNAL_SERVICE_SECRET === undefined) throw new Error("NOTIFICATION_SERVICE_AUTH_NOT_CONFIGURED");
  return new SignJWT({ serviceName: "message-server" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.INTERNAL_SERVICE_ISSUER)
    .setAudience(env.INTERNAL_SERVICE_AUDIENCE)
    .setSubject("message-server")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET));
}

async function requestNotification(input: { recipientUserId: string; type: "message"; title: string; body: string; data: Record<string, string>; deduplicationKey: string; channelId: "messages" }): Promise<void> {
  if (env.NOTIFICATION_SERVICE_URL === undefined) throw new Error("NOTIFICATION_SERVICE_UNAVAILABLE");
  const token = await serviceToken();
  const response = await fetch(`${env.NOTIFICATION_SERVICE_URL}/internal/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "x-internal-service-token": token, "x-request-id": randomUUID(), "x-correlation-id": randomUUID() },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`NOTIFICATION_SERVICE_HTTP_${response.status}`);
}

export async function dispatchNewDirectMessage(input: MessagePushInput): Promise<void> {
  try {
    if (await isUserBlockedEitherDirection(input.senderId, input.recipientId)) return;
    if (await isConversationMuted(input.message.conversationId, input.recipientId)) return;
    const sender = await getUserById(input.senderId);
    if (sender === null) return;
    await requestNotification({
      recipientUserId: input.recipientId,
      type: "message",
      title: sender.displayName,
      body: notificationPreview(input.message),
      data: { type: "message", conversationId: input.message.conversationId, senderId: input.message.senderId, messageId: input.message.id },
      channelId: "messages",
      deduplicationKey: `terqivo:push:message:${input.message.id}`,
    });
    logger.info({ event: "push.message_requested", recipientId: input.recipientId }, "Notification Server accepted direct message push");
  } catch (error: unknown) {
    logger.warn({ err: error, recipientId: input.recipientId }, "Notification Server message push request failed");
  }
}
