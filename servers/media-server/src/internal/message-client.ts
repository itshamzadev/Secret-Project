import { randomUUID } from "node:crypto";
import { AppError } from "../core/errors.js";
import { env } from "../config/env.js";
import { issueServiceToken } from "./service-auth.js";

interface BridgeResponse { success: boolean; data?: unknown; error?: { code?: unknown; message?: unknown } }

export interface MediaDescriptor {
  url: string;
  storageKey: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  fileName: string | null;
  encrypted?: boolean;
  encryptionVersion?: "aes-256-gcm-v1";
}

export interface MessageMediaResult { message: unknown; duplicate: boolean }
export interface StagedMediaResult { storageKey: string; size: number; duplicate: boolean }

export async function authorizeConversation(accessToken: string, conversationId: string): Promise<void> {
  await requestMessage("/internal/media/authorize-conversation", accessToken, { conversationId });
}

export async function sendMediaMessage(accessToken: string, conversationId: string, input: { clientMessageId: string; type: string; media: MediaDescriptor }): Promise<MessageMediaResult> {
  return requestMessage<MessageMediaResult>("/internal/media/send", accessToken, { conversationId, ...input });
}

export async function stageEncryptedMedia(accessToken: string, input: { conversationId: string; clientMessageId: string; type: string; storageKey: string; size: number }): Promise<StagedMediaResult> {
  return requestMessage<StagedMediaResult>("/internal/media/stage", accessToken, input);
}

export async function authorizeDownload(accessToken: string, storageKey: string): Promise<MediaDescriptor> {
  return requestMessage<MediaDescriptor>("/internal/media/authorize-download", accessToken, { storageKey });
}

async function requestMessage<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  if (env.MESSAGE_SERVICE_URL === undefined) throw new AppError({ code: "MESSAGE_SERVICE_UNAVAILABLE", message: "Messaging is temporarily unavailable.", statusCode: 503 });
  let response: Response;
  try {
    response = await fetch(`${env.MESSAGE_SERVICE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "x-internal-service-token": await issueServiceToken(env.SERVICE_NAME),
        "x-request-id": randomUUID(),
        "x-correlation-id": randomUUID(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AppError({ code: "MESSAGE_SERVICE_UNAVAILABLE", message: "Messaging is temporarily unavailable.", statusCode: 503 });
  }
  const parsed = (await response.json().catch(() => null)) as BridgeResponse | null;
  if (!response.ok || parsed?.success !== true || parsed.data === undefined) {
    const code = typeof parsed?.error?.code === "string" ? parsed.error.code : "MESSAGE_SERVICE_UNAVAILABLE";
    const message = typeof parsed?.error?.message === "string" ? parsed.error.message : "Messaging is temporarily unavailable.";
    throw new AppError({ code, message, statusCode: response.status >= 500 ? 503 : response.status });
  }
  return parsed.data as T;
}
