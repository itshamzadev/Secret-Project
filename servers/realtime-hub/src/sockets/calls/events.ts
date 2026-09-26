import type { Server } from "socket.io";

import type { RedisRuntime } from "../../redis/client.js";
import { CALL_EVENT_CHANNEL, subscribeChannel } from "../../redis/subscriptions.js";
import { logger } from "../../logging/logger.js";
import { sessionRoom, userRoom } from "../rooms.js";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function claimEvent(redis: RedisRuntime, eventId: string): Promise<boolean> {
  return (await redis.command.set(`terqivo:realtime-event:${eventId}`, "1", { NX: true, EX: 120 })) === "OK";
}

export async function subscribeCallEvents(io: Server, redis: RedisRuntime): Promise<() => Promise<void>> {
  return subscribeChannel(redis, CALL_EVENT_CHANNEL, async (raw) => {
    let parsed: unknown;
    try { parsed = JSON.parse(raw) as unknown; } catch { return; }
    const event = record(parsed);
    const call = record(event?.call);
    const kind = stringValue(event?.kind);
    if (call === null || kind === null) return;
    const eventId = stringValue(event?.eventId) ?? `${kind}:${stringValue(call.id) ?? "call"}:${stringValue(call.updatedAt) ?? "state"}`;
    if (!(await claimEvent(redis, eventId))) return;
    const payload = event?.caller === undefined ? { call } : { call, caller: event.caller };
    const targetSessionId = stringValue(event?.targetSessionId);
    const excludeSessionId = stringValue(event?.excludeSessionId);
    const targetUserIds = Array.isArray(event?.targetUserIds) ? event.targetUserIds.filter((value): value is string => typeof value === "string" && value.length > 0) : [];
    if (targetSessionId !== null) {
      // A session room is backed by the Redis adapter, so any Hub instance
      // can deliver a single-session event without claiming it locally.
      io.to(sessionRoom(targetSessionId)).emit(kind, payload);
      return;
    }
    if (targetUserIds.length > 0) {
      for (const userId of targetUserIds) {
        if (excludeSessionId !== null) io.to(userRoom(userId)).except(sessionRoom(excludeSessionId)).emit(kind, payload);
        else io.to(userRoom(userId)).emit(kind, payload);
      }
      return;
    }
    const callerId = stringValue(call.callerId);
    const calleeId = stringValue(call.calleeId);
    if (kind === "call:missed") {
      if (callerId !== null) io.to(userRoom(callerId)).emit(kind, payload);
      if (calleeId !== null) io.to(userRoom(calleeId)).emit(kind, payload);
      return;
    }
    if (callerId !== null) io.to(userRoom(callerId)).emit(kind, payload);
    if (calleeId !== null) io.to(userRoom(calleeId)).emit(kind, payload);
    logger.debug({ event: kind }, "Call event delivered");
  });
}
