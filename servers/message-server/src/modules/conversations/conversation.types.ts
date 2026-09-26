import type { HydratedDocument, Types } from "mongoose";

export interface ConversationParticipant {
  userId: Types.ObjectId;
  joinedAt: Date;
  lastDeliveredMessageId: Types.ObjectId | null;
  lastDeliveredSequence: number;
  lastDeliveredAt: Date | null;
  lastReadMessageId: Types.ObjectId | null;
  lastReadSequence: number;
  lastReadAt: Date | null;
  unreadCount: number;
  mutedUntil: Date | null;
  muted: boolean;
  manualUnread: boolean;
  clearedAt: Date | null;
}

export interface ConversationEntity {
  type: "direct";
  directKey: string;
  participants: ConversationParticipant[];
  messageSequence: number;
  lastMessageId: Types.ObjectId | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationDocument = HydratedDocument<ConversationEntity>;
