import type { MessageDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { decodeCursor, encodeCursor } from "../../utils/cursors.js";
import { isMongoDuplicateKeyError } from "../../utils/mongo.js";
import type { AuthContext } from "../auth/auth.types.js";
import {
  getOtherParticipant,
  getOwnedConversation,
} from "../conversations/conversation.service.js";
import { ConversationModel } from "../conversations/conversation.model.js";
import type { ConversationDocument } from "../conversations/conversation.types.js";
import { dispatchNewDirectMessage } from "../notifications/push.service.js";
import { toMessageDto } from "./message.dto.js";
import { MessageModel } from "./message.model.js";
import type {
  MessageHistoryQuery,
  MessageReadInput,
  MessageTextInput,
} from "./message.validation.js";
import type { MessageDocument } from "./message.types.js";

function messageNotFound(): AppError {
  return new AppError({
    code: "MESSAGE_NOT_FOUND",
    message: "The message was not found.",
    statusCode: 404,
  });
}

function receiptNotAllowed(): AppError {
  return new AppError({
    code: "RECEIPT_NOT_ALLOWED",
    message: "This receipt cannot be applied to that message.",
    statusCode: 400,
  });
}

export interface SentMessageResult {
  message: MessageDto;
  conversation: ConversationDocument;
  recipientId: string;
  duplicate: boolean;
}

function findExistingMessage(
  context: AuthContext,
  clientMessageId: string,
): Promise<MessageDocument | null> {
  return MessageModel.findOne({
    senderId: new Types.ObjectId(context.userId),
    clientMessageId,
  }).exec();
}

export async function sendTextMessage(
  context: AuthContext,
  conversationId: string,
  input: MessageTextInput,
): Promise<SentMessageResult> {
  const existing = await findExistingMessage(context, input.clientMessageId);
  if (existing !== null) {
    if (existing.conversationId.toString() !== conversationId) {
      throw new AppError({
        code: "CLIENT_MESSAGE_ID_CONFLICT",
        message: "The client message identifier is already used elsewhere.",
        statusCode: 409,
      });
    }
    const conversation = await getOwnedConversation(context, conversationId);
    return {
      message: toMessageDto(existing, conversation, context.userId),
      conversation,
      recipientId: getOtherParticipant(conversation, context.userId).toString(),
      duplicate: true,
    };
  }

  const conversation = await getOwnedConversation(context, conversationId);
  const recipientId = getOtherParticipant(conversation, context.userId);
  const updatedConversation = await ConversationModel.findOneAndUpdate(
    {
      _id: conversation._id,
      "participants.userId": new Types.ObjectId(context.userId),
    },
    {
      $inc: {
        messageSequence: 1,
        "participants.$[recipient].unreadCount": 1,
      },
    },
    {
      returnDocument: "after",
      arrayFilters: [{ "recipient.userId": recipientId }],
    },
  ).exec();

  if (updatedConversation === null) {
    throw messageNotFound();
  }

  const now = new Date();
  let message: MessageDocument;
  try {
    message = await MessageModel.create({
      conversationId: conversation._id,
      senderId: new Types.ObjectId(context.userId),
      clientMessageId: input.clientMessageId,
      type: input.type,
      text: input.text,
      replyToMessageId: null,
      sequence: updatedConversation.messageSequence,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      const concurrent = await findExistingMessage(
        context,
        input.clientMessageId,
      );
      if (concurrent !== null) {
        const currentConversation = await getOwnedConversation(
          context,
          conversationId,
        );
        return {
          message: toMessageDto(
            concurrent,
            currentConversation,
            context.userId,
          ),
          conversation: currentConversation,
          recipientId: recipientId.toString(),
          duplicate: true,
        };
      }
    }
    throw error;
  }

  await ConversationModel.updateOne(
    { _id: conversation._id },
    { $set: { lastMessageId: message._id, lastMessageAt: now } },
  ).exec();
  const currentConversation = await getOwnedConversation(
    context,
    conversationId,
  );

  void dispatchNewDirectMessage({
    message: toMessageDto(message, currentConversation, context.userId),
    recipientId: recipientId.toString(),
    senderId: context.userId,
  });

  return {
    message: toMessageDto(message, currentConversation, context.userId),
    conversation: currentConversation,
    recipientId: recipientId.toString(),
    duplicate: false,
  };
}

export interface MediaMessageInput {
  clientMessageId: string;
  type: "image" | "video" | "audio" | "file";
  media: NonNullable<MessageDocument["media"]>;
}

export async function sendMediaMessage(
  context: AuthContext,
  conversationId: string,
  input: MediaMessageInput,
): Promise<SentMessageResult> {
  const existing = await findExistingMessage(context, input.clientMessageId);
  if (existing !== null) {
    if (existing.conversationId.toString() !== conversationId) {
      throw new AppError({
        code: "CLIENT_MESSAGE_ID_CONFLICT",
        message: "The client message identifier is already used elsewhere.",
        statusCode: 409,
      });
    }
    const conversation = await getOwnedConversation(context, conversationId);
    return {
      message: toMessageDto(existing, conversation, context.userId),
      conversation,
      recipientId: getOtherParticipant(conversation, context.userId).toString(),
      duplicate: true,
    };
  }

  const conversation = await getOwnedConversation(context, conversationId);
  const recipientId = getOtherParticipant(conversation, context.userId);
  const updatedConversation = await ConversationModel.findOneAndUpdate(
    {
      _id: conversation._id,
      "participants.userId": new Types.ObjectId(context.userId),
    },
    {
      $inc: {
        messageSequence: 1,
        "participants.$[recipient].unreadCount": 1,
      },
    },
    {
      returnDocument: "after",
      arrayFilters: [{ "recipient.userId": recipientId }],
    },
  ).exec();
  if (updatedConversation === null) throw messageNotFound();

  const now = new Date();
  let message: MessageDocument;
  try {
    message = await MessageModel.create({
      conversationId: conversation._id,
      senderId: new Types.ObjectId(context.userId),
      clientMessageId: input.clientMessageId,
      type: input.type,
      text: null,
      media: input.media,
      replyToMessageId: null,
      sequence: updatedConversation.messageSequence,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      const concurrent = await findExistingMessage(
        context,
        input.clientMessageId,
      );
      if (concurrent !== null) {
        const currentConversation = await getOwnedConversation(
          context,
          conversationId,
        );
        return {
          message: toMessageDto(
            concurrent,
            currentConversation,
            context.userId,
          ),
          conversation: currentConversation,
          recipientId: recipientId.toString(),
          duplicate: true,
        };
      }
    }
    throw error;
  }

  await ConversationModel.updateOne(
    { _id: conversation._id },
    { $set: { lastMessageId: message._id, lastMessageAt: now } },
  ).exec();
  const currentConversation = await getOwnedConversation(
    context,
    conversationId,
  );
  const messageDto = toMessageDto(message, currentConversation, context.userId);
  void dispatchNewDirectMessage({
    message: messageDto,
    recipientId: recipientId.toString(),
    senderId: context.userId,
  });
  return {
    message: messageDto,
    conversation: currentConversation,
    recipientId: recipientId.toString(),
    duplicate: false,
  };
}

export async function getMessageHistory(
  context: AuthContext,
  conversationId: string,
  query: MessageHistoryQuery,
): Promise<{ messages: MessageDto[]; nextCursor: string | null }> {
  const conversation = await getOwnedConversation(context, conversationId);
  const cursor = decodeCursor(query.cursor);
  const filter: Record<string, unknown> = {
    conversationId: conversation._id,
  };
  if (cursor !== null) {
    const cursorDate = new Date(cursor.createdAt);
    if (
      Number.isNaN(cursorDate.getTime()) ||
      !Types.ObjectId.isValid(cursor.id)
    ) {
      throw new AppError({
        code: "INVALID_CURSOR",
        message: "The pagination cursor is invalid.",
        statusCode: 400,
      });
    }
    filter.$or = [
      { createdAt: { $lt: cursorDate } },
      { createdAt: cursorDate, _id: { $lt: new Types.ObjectId(cursor.id) } },
    ];
  }

  const messages = await MessageModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .exec();
  const hasNext = messages.length > query.limit;
  const page = hasNext ? messages.slice(0, query.limit) : messages;
  const last = page.at(-1);
  return {
    messages: page.map((message) =>
      toMessageDto(message, conversation, context.userId),
    ),
    nextCursor:
      hasNext && last !== undefined
        ? encodeCursor({
            createdAt: last.createdAt.toISOString(),
            id: last._id.toString(),
          })
        : null,
  };
}

export interface DeliveryReceipt {
  messageId: string;
  conversationId: string;
  senderId: string;
  userId: string;
  deliveredAt: string;
}

export async function markMessageDelivered(
  context: AuthContext,
  messageId: string,
): Promise<DeliveryReceipt> {
  if (!Types.ObjectId.isValid(messageId)) {
    throw messageNotFound();
  }
  const message = await MessageModel.findById(messageId).exec();
  if (message === null) {
    throw messageNotFound();
  }
  const conversation = await getOwnedConversation(
    context,
    message.conversationId.toString(),
  );
  if (message.senderId.toString() === context.userId) {
    throw receiptNotAllowed();
  }
  const state = conversation.participants.find(
    (participant) => participant.userId.toString() === context.userId,
  );
  if (state === undefined) {
    throw receiptNotAllowed();
  }

  const deliveredAt = new Date();
  if (message.sequence > state.lastDeliveredSequence) {
    await ConversationModel.updateOne(
      {
        _id: conversation._id,
        participants: {
          $elemMatch: {
            userId: new Types.ObjectId(context.userId),
            lastDeliveredSequence: { $lt: message.sequence },
          },
        },
      },
      {
        $set: {
          "participants.$[recipient].lastDeliveredMessageId": message._id,
          "participants.$[recipient].lastDeliveredSequence": message.sequence,
          "participants.$[recipient].lastDeliveredAt": deliveredAt,
        },
      },
      {
        arrayFilters: [
          { "recipient.userId": new Types.ObjectId(context.userId) },
        ],
      },
    ).exec();
  }
  return {
    messageId: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    userId: context.userId,
    deliveredAt: deliveredAt.toISOString(),
  };
}

export interface ReadReceipt {
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
  lastReadAt: string;
  unreadCount: number;
}

export async function markConversationRead(
  context: AuthContext,
  conversationId: string,
  input: MessageReadInput,
): Promise<ReadReceipt> {
  const conversation = await getOwnedConversation(context, conversationId);
  const message = await MessageModel.findOne({
    _id: new Types.ObjectId(input.lastReadMessageId),
    conversationId: conversation._id,
  }).exec();
  if (message === null || message.senderId.toString() === context.userId) {
    throw receiptNotAllowed();
  }

  const state = conversation.participants.find(
    (participant) => participant.userId.toString() === context.userId,
  );
  if (state === undefined) {
    throw receiptNotAllowed();
  }

  const readAt = new Date();
  if (message.sequence > state.lastReadSequence) {
    const unreadToClear = await MessageModel.countDocuments({
      conversationId: conversation._id,
      senderId: { $ne: new Types.ObjectId(context.userId) },
      sequence: { $gt: state.lastReadSequence, $lte: message.sequence },
    }).exec();
    const unreadCount = Math.max(0, state.unreadCount - unreadToClear);
    await ConversationModel.updateOne(
      {
        _id: conversation._id,
        participants: {
          $elemMatch: {
            userId: new Types.ObjectId(context.userId),
            lastReadSequence: { $lt: message.sequence },
          },
        },
      },
      {
        $set: {
          "participants.$[reader].lastReadMessageId": message._id,
          "participants.$[reader].lastReadSequence": message.sequence,
          "participants.$[reader].lastReadAt": readAt,
          "participants.$[reader].unreadCount": unreadCount,
        },
      },
      {
        arrayFilters: [{ "reader.userId": new Types.ObjectId(context.userId) }],
      },
    ).exec();
    state.unreadCount = unreadCount;
  }

  return {
    conversationId: conversation._id.toString(),
    userId: context.userId,
    lastReadMessageId: message._id.toString(),
    lastReadAt: readAt.toISOString(),
    unreadCount: state.unreadCount,
  };
}

export async function initializeMessageModels(): Promise<void> {
  await MessageModel.init();
}
