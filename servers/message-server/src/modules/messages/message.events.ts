import type {
  E2EFEEncryptedMessageEvent,
  E2EFEEncryptedMessageUpdatedEvent,
  MessageDto,
  MessageUserStateUpdatedEvent,
} from "../../contracts/index.js";
import { redisClient } from "../../lib/redis.js";

const remoteMessageEventChannel = "terqivo:message-events:v1";

function publishRemote(kind: string, event: unknown): void {
  if (!redisClient.isReady) return;
  const record = typeof event === "object" && event !== null ? event as Record<string, unknown> : {};
  const message = typeof record.message === "object" && record.message !== null ? record.message as Record<string, unknown> : {};
  const eventId = [
    kind,
    typeof message.id === "string" ? message.id : typeof record.conversationId === "string" ? record.conversationId : "event",
    typeof message.updatedAt === "string" ? message.updatedAt : typeof message.createdAt === "string" ? message.createdAt : typeof record.userId === "string" ? record.userId : "state",
  ].join(":");
  void redisClient
    .publish(remoteMessageEventChannel, JSON.stringify({ kind, event, eventId }))
    .catch(() => undefined);
}

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

export interface MessageUpdatedEvent {
  message: MessageDto;
  recipientId: string;
  senderId: string;
}

export interface MessageDeletedEvent {
  message: MessageDto;
  recipientId: string;
  senderId: string;
}

export interface EncryptedMessageCreatedEvent {
  message: MessageDto;
  envelope: E2EFEEncryptedMessageEvent["envelope"];
  recipientId: string;
  senderId: string;
}

export interface EncryptedMessageUpdatedEvent {
  message: MessageDto;
  envelope: E2EFEEncryptedMessageUpdatedEvent["envelope"];
  recipientId: string;
  senderId: string;
}

export type MessageUserStateEvent = MessageUserStateUpdatedEvent;

const listeners = new Set<(event: MessageCreatedEvent) => void>();
const reactionListeners = new Set<
  (event: MessageReactionUpdatedEvent) => void
>();
const updatedListeners = new Set<(event: MessageUpdatedEvent) => void>();
const deletedListeners = new Set<(event: MessageDeletedEvent) => void>();
const userStateListeners = new Set<(event: MessageUserStateEvent) => void>();
const encryptedListeners = new Set<
  (event: EncryptedMessageCreatedEvent) => void
>();
const encryptedUpdatedListeners = new Set<
  (event: EncryptedMessageUpdatedEvent) => void
>();

export function subscribeToMessageCreated(
  listener: (event: MessageCreatedEvent) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishMessageCreated(event: MessageCreatedEvent): void {
  for (const listener of listeners) listener(event);
  publishRemote("message.created", event);
}

export function subscribeToEncryptedMessageCreated(
  listener: (event: EncryptedMessageCreatedEvent) => void,
): () => void {
  encryptedListeners.add(listener);
  return () => encryptedListeners.delete(listener);
}

export function publishEncryptedMessageCreated(
  event: EncryptedMessageCreatedEvent,
): void {
  for (const listener of encryptedListeners) listener(event);
  publishRemote("message.encrypted.created", event);
}

export function subscribeToEncryptedMessageUpdated(
  listener: (event: EncryptedMessageUpdatedEvent) => void,
): () => void {
  encryptedUpdatedListeners.add(listener);
  return () => encryptedUpdatedListeners.delete(listener);
}

export function publishEncryptedMessageUpdated(
  event: EncryptedMessageUpdatedEvent,
): void {
  for (const listener of encryptedUpdatedListeners) listener(event);
  publishRemote("message.encrypted.updated", event);
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
  publishRemote("message.reaction.updated", event);
}

export function subscribeToMessageUpdated(
  listener: (event: MessageUpdatedEvent) => void,
): () => void {
  updatedListeners.add(listener);
  return () => updatedListeners.delete(listener);
}

export function publishMessageUpdated(event: MessageUpdatedEvent): void {
  for (const listener of updatedListeners) listener(event);
  publishRemote("message.updated", event);
}

export function subscribeToMessageDeleted(
  listener: (event: MessageDeletedEvent) => void,
): () => void {
  deletedListeners.add(listener);
  return () => deletedListeners.delete(listener);
}

export function publishMessageDeleted(event: MessageDeletedEvent): void {
  for (const listener of deletedListeners) listener(event);
  publishRemote("message.deleted", event);
}

export function subscribeToMessageUserStateUpdated(
  listener: (event: MessageUserStateEvent) => void,
): () => void {
  userStateListeners.add(listener);
  return () => userStateListeners.delete(listener);
}

export function publishMessageUserStateUpdated(
  event: MessageUserStateEvent,
): void {
  for (const listener of userStateListeners) listener(event);
  publishRemote("message.user-state-updated", event);
}
