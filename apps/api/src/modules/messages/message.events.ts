import type { MessageDto } from "@terqivo/contracts";

export interface MessageCreatedEvent {
  message: MessageDto;
  recipientId: string;
  senderId: string;
}

const listeners = new Set<(event: MessageCreatedEvent) => void>();

export function subscribeToMessageCreated(
  listener: (event: MessageCreatedEvent) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishMessageCreated(event: MessageCreatedEvent): void {
  for (const listener of listeners) listener(event);
}
