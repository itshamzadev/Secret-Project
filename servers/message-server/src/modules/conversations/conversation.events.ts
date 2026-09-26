import type { ConversationClearedEvent } from "../../contracts/index.js";
import { redisClient } from "../../lib/redis.js";

const listeners = new Set<(event: ConversationClearedEvent) => void>();

export function subscribeToConversationCleared(
  listener: (event: ConversationClearedEvent) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishConversationCleared(
  event: ConversationClearedEvent,
): void {
  for (const listener of listeners) listener(event);
  if (redisClient.isReady) {
    const eventId = `conversation.cleared:${event.conversationId}:${event.userId}:${event.clearedAt}`;
    void redisClient
      .publish("terqivo:message-events:v1", JSON.stringify({ kind: "conversation.cleared", event, eventId }))
      .catch(() => undefined);
  }
}
