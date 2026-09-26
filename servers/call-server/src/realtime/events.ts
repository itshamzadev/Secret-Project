import type { CallDocument, CallSignalDto } from "../models/call.types.js";
import { callSignal } from "../modules/calls/call.service.js";
import { redisClient } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

export const CALL_EVENT_CHANNEL = "terqivo:call-events:v1";

export interface CallRealtimeEvent {
  eventId: string;
  kind: "call:ringing" | "call:incoming" | "call:accepted" | "call:answered-elsewhere" | "call:declined" | "call:cancelled" | "call:ended" | "call:failed" | "call:missed";
  call: CallSignalDto;
  caller?: { id: string; username: string; displayName: string; avatarUrl: string | null; badges?: string[] };
  targetUserIds?: string[];
  targetSessionId?: string;
  excludeSessionId?: string;
}

export async function publishCallEvent(event: Omit<CallRealtimeEvent, "eventId">): Promise<void> {
  if (!redisClient.isReady) {
    logger.warn({ kind: event.kind }, "Call event was not published because Redis is unavailable");
    return;
  }
  const eventId = `${event.kind}:${event.call.id}:${randomUUID()}`;
  await redisClient.publish(CALL_EVENT_CHANNEL, JSON.stringify({ ...event, eventId }));
}

export function callEvent(call: CallDocument, kind: CallRealtimeEvent["kind"]): Omit<CallRealtimeEvent, "eventId"> {
  return { kind, call: callSignal(call) };
}
import { randomUUID } from "node:crypto";
