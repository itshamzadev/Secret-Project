import type { HydratedDocument, Types } from "mongoose";

export interface MessageEntity {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  clientMessageId: string;
  type: "text";
  text: string;
  replyToMessageId: Types.ObjectId | null;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageDocument = HydratedDocument<MessageEntity>;
