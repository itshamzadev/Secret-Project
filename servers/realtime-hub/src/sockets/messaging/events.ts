import type { Server } from "socket.io";

import type { RedisRuntime } from "../../redis/client.js";
import { MESSAGE_EVENT_CHANNEL, subscribeChannel } from "../../redis/subscriptions.js";
import { logger } from "../../logging/logger.js";
import { userRoom } from "../rooms.js";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function eventIdentity(kind: string, event: Record<string, unknown>): string {
  const message = record(event.message);
  return [
    kind,
    stringValue(message?.id) ?? stringValue(event.conversationId) ?? "event",
    stringValue(message?.updatedAt) ?? stringValue(message?.createdAt) ?? stringValue(event.clearedAt) ?? stringValue(event.userId) ?? "state"
  ].join(":");
}

function emitUser(io: Server, userId: unknown, event: string, payload: unknown): void {
  const id = stringValue(userId);
  if (id !== null) io.to(userRoom(id)).emit(event, payload);
}

async function claimEvent(redis: RedisRuntime, eventId: string): Promise<boolean> {
  const result = await redis.command.set(`terqivo:realtime-event:${eventId}`, "1", { NX: true, EX: 120 });
  return result === "OK";
}

export async function subscribeMessageEvents(io: Server, redis: RedisRuntime): Promise<() => Promise<void>> {
  return subscribeChannel(redis, MESSAGE_EVENT_CHANNEL, async (raw) => {
    let parsed: unknown;
    try { parsed = JSON.parse(raw) as unknown; } catch { return; }
    const outer = record(parsed);
    const kind = stringValue(outer?.kind);
    const event = record(outer?.event);
    if (kind === null || event === null) return;
    const eventId = stringValue(outer?.eventId) ?? eventIdentity(kind, event);
    if (!(await claimEvent(redis, eventId))) return;

    switch (kind) {
      case "message.created":
        emitUser(io, event.recipientId, "message:new", { message: event.message });
        emitUser(io, event.senderId, "message:sent", { message: event.message, duplicate: false });
        return;
      case "message.encrypted.created":
        emitUser(io, event.recipientId, "message:encrypted-new", { message: event.message, envelope: event.envelope });
        return;
      case "message.encrypted.updated":
        emitUser(io, event.recipientId, "message:encrypted-updated", { message: event.message, envelope: event.envelope });
        return;
      case "message.reaction.updated": {
        const payload = { message: event.message };
        emitUser(io, event.recipientId, "message:reaction-updated", payload);
        emitUser(io, event.senderId, "message:reaction-updated", payload);
        return;
      }
      case "message.updated": {
        const payload = { message: event.message };
        emitUser(io, event.recipientId, "message:updated", payload);
        emitUser(io, event.senderId, "message:updated", payload);
        return;
      }
      case "message.deleted": {
        const payload = { message: event.message };
        emitUser(io, event.recipientId, "message:deleted", payload);
        emitUser(io, event.senderId, "message:deleted", payload);
        return;
      }
      case "message.user-state-updated":
        emitUser(io, event.userId, "message:user-state-updated", event);
        return;
      case "conversation.cleared":
        emitUser(io, event.userId, "conversation:cleared", event);
        return;
      default:
        logger.debug({ event: kind }, "Realtime ignored unknown message event");
    }
  });
}
