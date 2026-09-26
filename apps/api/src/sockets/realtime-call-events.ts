import { redisClient } from "../lib/redis.js";
import type { CallDocument } from "../modules/calls/call.types.js";
import { callSignal } from "../modules/calls/call.service.js";

export const realtimeCallEventChannel = "terqivo:call-events:v1";

export function publishRealtimeCallEvent(kind: "call:missed", call: CallDocument): void {
  if (!redisClient.isReady) return;
  const event = { kind, call: callSignal(call), eventId: `${kind}:${call._id.toString()}:${call.updatedAt.toISOString()}` };
  void redisClient.publish(realtimeCallEventChannel, JSON.stringify(event)).catch(() => undefined);
}
