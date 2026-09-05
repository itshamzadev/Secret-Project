import type { HydratedDocument, Types } from "mongoose";

import type {
  MessageMediaDto,
  MessageReactionEmoji,
  MessageType,
} from "@terqivo/contracts";

export interface MessageReactionEntity {
  userId: Types.ObjectId;
  emoji: MessageReactionEmoji;
  reactedAt: Date;
}

export interface MessageEntity {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  clientMessageId: string;
  type: MessageType;
  text: string | null;
  media: MessageMediaDto | null;
  reactions: MessageReactionEntity[];
  replyToMessageId: Types.ObjectId | null;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageDocument = HydratedDocument<MessageEntity>;
