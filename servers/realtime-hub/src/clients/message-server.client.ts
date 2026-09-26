import { env } from "../config/env.js";
import type { AuthContext } from "../auth/socket-auth.js";
import { requestInternal } from "./http.js";

export interface MessageSendResult {
  message: unknown;
  duplicate: boolean;
  recipientId: string;
  envelopes?: unknown;
}

export interface ReceiptResult {
  receipt: {
    conversationId: string;
    messageId: string;
    senderId: string;
    recipientId: string;
    status: "delivered" | "read";
    deliveredAt?: string;
    readAt?: string;
  };
}

export interface TypingResult {
  recipientId: string;
}

export interface ParticipantsResult {
  participantIds: string[];
}

export function sendTextMessage(context: AuthContext, token: string, input: Record<string, unknown>): Promise<MessageSendResult> {
  return requestInternal<MessageSendResult>(env.MESSAGE_SERVICE_URL, "/internal/messages/send", { method: "POST", accessToken: token, body: { ...input, userId: context.userId } });
}

export function sendEncryptedMessage(context: AuthContext, token: string, input: Record<string, unknown>): Promise<MessageSendResult> {
  return requestInternal<MessageSendResult>(env.MESSAGE_SERVICE_URL, "/internal/messages/send-encrypted", { method: "POST", accessToken: token, body: { ...input, userId: context.userId } });
}

export function markDelivered(context: AuthContext, token: string, messageId: string): Promise<ReceiptResult> {
  return requestInternal<ReceiptResult>(env.MESSAGE_SERVICE_URL, "/internal/messages/delivered", { method: "POST", accessToken: token, body: { messageId, userId: context.userId } });
}

export function markRead(context: AuthContext, token: string, input: Record<string, unknown>): Promise<ReceiptResult> {
  return requestInternal<ReceiptResult>(env.MESSAGE_SERVICE_URL, "/internal/conversations/read", { method: "POST", accessToken: token, body: { ...input, userId: context.userId } });
}

export function authorizeTyping(context: AuthContext, token: string, conversationId: string): Promise<TypingResult> {
  return requestInternal<TypingResult>(env.MESSAGE_SERVICE_URL, "/internal/conversations/typing", { method: "POST", accessToken: token, body: { conversationId, userId: context.userId } });
}

export function getConversationParticipants(userId: string): Promise<ParticipantsResult> {
  return requestInternal<ParticipantsResult>(env.MESSAGE_SERVICE_URL, `/internal/users/${encodeURIComponent(userId)}/participants`);
}
