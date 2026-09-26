import { createHmac, randomUUID } from "node:crypto";

import type {
  E2EFEEncryptedMessageData,
  MessageDto,
} from "@terqivo/contracts";

import { env } from "../config/env.js";
import { AppError } from "../core/errors.js";
import type { AuthContext } from "../modules/auth/auth.types.js";
import type {
  E2EFEEncryptedMessageInput,
  MessageReadInput,
  MessageTextInput,
} from "../modules/messages/message.validation.js";

const BRIDGE_TIMEOUT_MS = 15_000;

interface BridgeEnvelope {
  success: boolean;
  data?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
  };
}

interface TextSendData {
  message: MessageDto;
  duplicate: boolean;
  recipientId: string;
}

interface EncryptedSendData extends E2EFEEncryptedMessageData {
  recipientId: string;
}

interface ReceiptData {
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

export function isMessageServerBridgeEnabled(): boolean {
  return env.MESSAGE_SERVICE_URL !== undefined && env.INTERNAL_SERVICE_SECRET !== undefined;
}

function internalServiceToken(): string {
  if (env.INTERNAL_SERVICE_SECRET === undefined) {
    throw new AppError({
      code: "MESSAGE_SERVICE_UNAVAILABLE",
      message: "Messaging is temporarily unavailable.",
      statusCode: 503,
    });
  }
  return createHmac("sha256", env.INTERNAL_SERVICE_SECRET)
    .update("terqivo-message-server")
    .digest("hex");
}

function bridgeError(statusCode: number, body: BridgeEnvelope | null): AppError {
  const upstreamCode = body?.error?.code;
  const upstreamMessage = body?.error?.message;
  if (
    statusCode >= 400 &&
    typeof upstreamCode === "string" &&
    typeof upstreamMessage === "string"
  ) {
    return new AppError({
      code: upstreamCode,
      message: upstreamMessage,
      statusCode,
    });
  }
  return new AppError({
    code: "MESSAGE_SERVICE_UNAVAILABLE",
    message: "Messaging is temporarily unavailable.",
    statusCode: statusCode >= 500 ? 503 : statusCode,
  });
}

async function postToMessageServer<T>(
  path: string,
  accessToken: string,
  body: unknown,
): Promise<T> {
  if (env.MESSAGE_SERVICE_URL === undefined) {
    throw new AppError({
      code: "MESSAGE_SERVICE_UNAVAILABLE",
      message: "Messaging is temporarily unavailable.",
      statusCode: 503,
    });
  }

  let response: Response;
  try {
    response = await fetch(`${env.MESSAGE_SERVICE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "x-internal-service-token": internalServiceToken(),
        "x-request-id": randomUUID(),
        "x-correlation-id": randomUUID(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });
  } catch {
    throw new AppError({
      code: "MESSAGE_SERVICE_UNAVAILABLE",
      message: "Messaging is temporarily unavailable.",
      statusCode: 503,
    });
  }

  const parsed = (await response.json().catch(() => null)) as BridgeEnvelope | null;
  if (!response.ok || parsed?.success !== true || parsed.data === undefined) {
    throw bridgeError(response.status, parsed);
  }
  return parsed.data as T;
}

export function sendTextMessageThroughMessageServer(
  context: AuthContext,
  accessToken: string,
  conversationId: string,
  input: MessageTextInput,
): Promise<TextSendData> {
  return postToMessageServer<TextSendData>(
    "/internal/messages/send",
    accessToken,
    { ...input, conversationId, userId: context.userId },
  );
}

export function sendEncryptedMessageThroughMessageServer(
  context: AuthContext,
  accessToken: string,
  input: E2EFEEncryptedMessageInput,
): Promise<EncryptedSendData> {
  return postToMessageServer<EncryptedSendData>(
    "/internal/messages/send-encrypted",
    accessToken,
    { ...input, userId: context.userId },
  );
}

export function markMessageDeliveredThroughMessageServer(
  context: AuthContext,
  accessToken: string,
  messageId: string,
): Promise<ReceiptData> {
  return postToMessageServer<ReceiptData>(
    "/internal/messages/delivered",
    accessToken,
    { messageId, userId: context.userId },
  );
}

export function markConversationReadThroughMessageServer(
  context: AuthContext,
  accessToken: string,
  input: MessageReadInput & { conversationId: string },
): Promise<ReceiptData> {
  return postToMessageServer<ReceiptData>(
    "/internal/conversations/read",
    accessToken,
    { ...input, conversationId: input.conversationId, userId: context.userId },
  );
}
