import type { MessageDto } from "@terqivo/contracts";

export interface MessageCreatedEvent {
  message: MessageDto;
  recipientId: string;
  senderId: string;
}

export interface MessageReactionUpdatedEvent {
  message: MessageDto;
  recipientId: string;
  senderId: string;
}

const listeners = new Set<(event: MessageCreatedEvent) => void>();
const reactionListeners = new Set<
  (event: MessageReactionUpdatedEvent) => void
>();

export function subscribeToMessageCreated(
  listener: (event: MessageCreatedEvent) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishMessageCreated(event: MessageCreatedEvent): void {
  for (const listener of listeners) listener(event);
}

export function subscribeToMessageReactionUpdated(
  listener: (event: MessageReactionUpdatedEvent) => void,
): () => void {
  reactionListeners.add(listener);
  return () => reactionListeners.delete(listener);
}

export function publishMessageReactionUpdated(
  event: MessageReactionUpdatedEvent,
): void {
  for (const listener of reactionListeners) listener(event);
}
