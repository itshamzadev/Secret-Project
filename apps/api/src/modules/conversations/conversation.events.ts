import type { ConversationClearedEvent } from "@terqivo/contracts";

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
}
