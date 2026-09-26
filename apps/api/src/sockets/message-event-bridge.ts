import type { Server } from "socket.io";

import { logger } from "../lib/logger.js";
import { redisClient } from "../lib/redis.js";
import { isMessageServerBridgeEnabled } from "./message-bridge.js";

const MESSAGE_EVENT_CHANNEL = "terqivo:message-events:v1";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function emitUserEvent(
  io: Server,
  userId: unknown,
  event: string,
  payload: unknown,
): void {
  const id = stringValue(userId);
  if (id !== null) io.to(`user:${id}`).emit(event, payload);
}

function forwardRemoteEvent(io: Server, raw: string): void {
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw) as unknown;
  } catch {
    return;
  }
  const outer = record(envelope);
  const kind = stringValue(outer?.kind);
  const event = record(outer?.event);
  if (kind === null || event === null) return;

  switch (kind) {
    case "message.created": {
      const recipientId = event.recipientId;
      const senderId = event.senderId;
      const message = event.message;
      emitUserEvent(io, recipientId, "message:new", { message });
      emitUserEvent(io, senderId, "message:sent", {
        message,
        duplicate: false,
      });
      return;
    }
    case "message.encrypted.created": {
      const recipientId = event.recipientId;
      emitUserEvent(io, recipientId, "message:encrypted-new", {
        message: event.message,
        envelope: event.envelope,
      });
      return;
    }
    case "message.encrypted.updated": {
      const recipientId = event.recipientId;
      emitUserEvent(io, recipientId, "message:encrypted-updated", {
        message: event.message,
        envelope: event.envelope,
      });
      return;
    }
    case "message.reaction.updated": {
      const payload = { message: event.message };
      emitUserEvent(io, event.recipientId, "message:reaction-updated", payload);
      emitUserEvent(io, event.senderId, "message:reaction-updated", payload);
      return;
    }
    case "message.updated": {
      const payload = { message: event.message };
      emitUserEvent(io, event.recipientId, "message:updated", payload);
      emitUserEvent(io, event.senderId, "message:updated", payload);
      return;
    }
    case "message.deleted": {
      const payload = { message: event.message };
      emitUserEvent(io, event.recipientId, "message:deleted", payload);
      emitUserEvent(io, event.senderId, "message:deleted", payload);
      return;
    }
    case "message.user-state-updated":
      emitUserEvent(io, event.userId, "message:user-state-updated", event);
      return;
    case "conversation.cleared":
      emitUserEvent(io, event.userId, "conversation:cleared", event);
      return;
    default:
      return;
  }
}

export async function createMessageEventBridge(
  io: Server,
): Promise<() => Promise<void>> {
  if (!isMessageServerBridgeEnabled()) return async () => undefined;

  const subscriber = redisClient.duplicate();
  subscriber.on("error", (error: Error) => {
    logger.error({ err: error }, "Redis message event bridge error");
  });
  await subscriber.connect();
  await subscriber.subscribe(MESSAGE_EVENT_CHANNEL, (raw) => {
    forwardRemoteEvent(io, raw);
  });

  return async () => {
    if (subscriber.isOpen) {
      await subscriber.quit();
    }
  };
}
