import type { ServiceIdentity } from "@terqivo/contracts";

export const eventNames = [
  "message.created",
  "message.delivered",
  "message.read",
  "conversation.created",
  "call.started",
  "call.ended",
  "notification.requested",
  "media.uploaded",
] as const;

export type EventName = (typeof eventNames)[number];

export interface EventEnvelope<TName extends EventName, TPayload> {
  id: string;
  type: TName;
  occurredAt: string;
  producer: ServiceIdentity;
  payload: TPayload;
}

export interface MessageCreatedPayload {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientUserIds: string[];
  e2efeVersion: string | null;
}

export interface MessageDeliveredPayload {
  messageId: string;
  conversationId: string;
  recipientUserId: string;
  recipientDeviceId: number | null;
}

export interface MessageReadPayload {
  messageId: string;
  conversationId: string;
  readerUserId: string;
}

export interface ConversationCreatedPayload {
  conversationId: string;
  type: "direct" | "group" | "channel";
  participantUserIds: string[];
}

export interface CallStartedPayload {
  callId: string;
  callerId: string;
  calleeId: string;
  type: "voice" | "video";
}

export interface CallEndedPayload {
  callId: string;
  callerId: string;
  calleeId: string;
  reason: string | null;
}

export interface NotificationRequestedPayload {
  notificationType: "message" | "incoming_call" | "missed_call";
  recipientUserIds: string[];
  referenceId: string;
}

export interface MediaUploadedPayload {
  mediaId: string;
  ownerUserId: string;
  mediaType: "image" | "video" | "audio" | "document";
  encrypted: boolean;
}

export type MessageCreatedEvent = EventEnvelope<
  "message.created",
  MessageCreatedPayload
>;
export type MessageDeliveredEvent = EventEnvelope<
  "message.delivered",
  MessageDeliveredPayload
>;
export type MessageReadEvent = EventEnvelope<"message.read", MessageReadPayload>;
export type ConversationCreatedEvent = EventEnvelope<
  "conversation.created",
  ConversationCreatedPayload
>;
export type CallStartedEvent = EventEnvelope<"call.started", CallStartedPayload>;
export type CallEndedEvent = EventEnvelope<"call.ended", CallEndedPayload>;
export type NotificationRequestedEvent = EventEnvelope<
  "notification.requested",
  NotificationRequestedPayload
>;
export type MediaUploadedEvent = EventEnvelope<
  "media.uploaded",
  MediaUploadedPayload
>;

export type DomainEvent =
  | MessageCreatedEvent
  | MessageDeliveredEvent
  | MessageReadEvent
  | ConversationCreatedEvent
  | CallStartedEvent
  | CallEndedEvent
  | NotificationRequestedEvent
  | MediaUploadedEvent;
