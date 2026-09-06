import type { HydratedDocument, Types } from "mongoose";

import type {
  E2EFEProtocolVersion,
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
  editedAt: Date | null;
  deletedForEveryoneAt: Date | null;
  deletedForEveryoneBy: Types.ObjectId | null;
  pinnedForEveryoneAt: Date | null;
  pinnedForEveryoneBy: Types.ObjectId | null;
  replyToMessageId: Types.ObjectId | null;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
  e2efeVersion: E2EFEProtocolVersion | null;
  senderDeviceId: number | null;
  e2efeRevisionId: string | null;
}

export type MessageDocument = HydratedDocument<MessageEntity>;
