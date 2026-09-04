import type { HydratedDocument, Types } from "mongoose";

import type { MessageMediaDto, MessageType } from "@terqivo/contracts";

export interface MessageEntity {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  clientMessageId: string;
  type: MessageType;
  text: string | null;
  media: MessageMediaDto | null;
  replyToMessageId: Types.ObjectId | null;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageDocument = HydratedDocument<MessageEntity>;
