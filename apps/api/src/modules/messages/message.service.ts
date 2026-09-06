import type {
  MessageDto,
  MessageUserStateUpdatedEvent,
} from "@terqivo/contracts";
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
import type { MessageUserStateEntity } from "./message-user-state.model.js";
import type { MessageReactionInput } from "./message.validation.js";
import { assertUsersCanInteract } from "../privacy/block.service.js";
import { MessageUserStateModel } from "./message-user-state.model.js";
import {
  publishMessageDeleted,
  publishMessageReactionUpdated,
  publishMessageUpdated,
  publishMessageUserStateUpdated,
} from "./message.events.js";
import { E2EFEMessageEnvelopeModel } from "../e2efe/e2efe-message-envelope.model.js";
import { E2EFEDeviceModel } from "../e2efe/e2efe-device.model.js";
import { env } from "../../config/env.js";

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

function messageActionNotAllowed(code: string, message: string): AppError {
  return new AppError({ code, message, statusCode: 403 });
}

function deletedMessageNotEditable(): AppError {
  return new AppError({
    code: "MESSAGE_DELETED_FOR_EVERYONE",
    message: "A deleted message cannot be changed.",
    statusCode: 409,
  });
}

async function assertPlaintextSendAllowed(
  senderId: string,
  recipientId: string,
): Promise<void> {
  if (!env.E2EFE_ENFORCEMENT_ENABLED) return;

  const [senderDevice, recipientDevice] = await Promise.all([
    E2EFEDeviceModel.exists({
      userId: new Types.ObjectId(senderId),
      active: true,
    }),
    E2EFEDeviceModel.exists({
      userId: new Types.ObjectId(recipientId),
      active: true,
    }),
  ]);
  if (senderDevice !== null && recipientDevice !== null) {
    throw new AppError({
      code: "E2EFE_REQUIRED",
      message: "This conversation requires end-to-end encrypted messaging.",
      statusCode: 409,
    });
  }
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
      message: toMessageDto(
        existing,
        conversation,
        context.userId,
        await getMessageUserState(existing, context.userId),
      ),
      conversation,
      recipientId: getOtherParticipant(conversation, context.userId).toString(),
      duplicate: true,
    };
  }

  const conversation = await getOwnedConversation(context, conversationId);
  const recipientId = getOtherParticipant(conversation, context.userId);
  await assertUsersCanInteract(context.userId, recipientId.toString());
  await assertPlaintextSendAllowed(context.userId, recipientId.toString());
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
            await getMessageUserState(concurrent, context.userId),
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
      message: toMessageDto(
        existing,
        conversation,
        context.userId,
        await getMessageUserState(existing, context.userId),
      ),
      conversation,
      recipientId: getOtherParticipant(conversation, context.userId).toString(),
      duplicate: true,
    };
  }

  const conversation = await getOwnedConversation(context, conversationId);
  const recipientId = getOtherParticipant(conversation, context.userId);
  await assertUsersCanInteract(context.userId, recipientId.toString());
  await assertPlaintextSendAllowed(context.userId, recipientId.toString());
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
            await getMessageUserState(concurrent, context.userId),
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
  const participantState = conversation.participants.find(
    (participant) => participant.userId.toString() === context.userId,
  );
  const historyClauses: Record<string, unknown>[] = [];
  const userId = new Types.ObjectId(context.userId);
  const userStates = await MessageUserStateModel.find({
    conversationId: conversation._id,
    userId,
  })
    .select({ messageId: 1, hidden: 1, favorite: 1, pinned: 1 })
    .exec();
  const hiddenMessageIds = userStates
    .filter((state) => state.hidden)
    .map((state) => state.messageId);
  if (hiddenMessageIds.length > 0) {
    historyClauses.push({ _id: { $nin: hiddenMessageIds } });
  }
  if (
    participantState?.clearedAt !== null &&
    participantState?.clearedAt !== undefined
  ) {
    const favoriteMessageIds = userStates
      .filter((state) => state.favorite && !state.hidden)
      .map((state) => state.messageId);
    historyClauses.push({
      $or: [
        { createdAt: { $gt: participantState.clearedAt } },
        ...(favoriteMessageIds.length > 0
          ? [{ _id: { $in: favoriteMessageIds } }]
          : []),
      ],
    });
  }
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
    historyClauses.push({
      $or: [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: new Types.ObjectId(cursor.id) } },
      ],
    });
  }
  if (historyClauses.length === 1) {
    Object.assign(filter, historyClauses[0]);
  } else if (historyClauses.length > 1) {
    filter.$and = historyClauses;
  }

  const messages = await MessageModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .exec();
  const hasNext = messages.length > query.limit;
  const page = hasNext ? messages.slice(0, query.limit) : messages;
  const envelopes =
    query.e2efeDeviceId === undefined || page.length === 0
      ? []
      : await E2EFEMessageEnvelopeModel.find({
          messageId: { $in: page.map((message) => message._id) },
          recipientUserId: userId,
          recipientDeviceId: query.e2efeDeviceId,
        }).exec();
  const envelopesByMessageId = new Map(
    envelopes.map((envelope) => [envelope.messageId.toString(), envelope]),
  );
  const statesByMessageId = new Map(
    userStates.map((state) => [state.messageId.toString(), state]),
  );
  const last = page.at(-1);
  return {
    messages: page.map((message) =>
      toMessageDto(
        message,
        conversation,
        context.userId,
        statesByMessageId.get(message._id.toString()) ?? null,
        envelopesByMessageId.get(message._id.toString()) ?? null,
      ),
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

export async function getMessageActionContext(
  context: AuthContext,
  messageId: string,
): Promise<{ message: MessageDocument; conversation: ConversationDocument }> {
  if (!Types.ObjectId.isValid(messageId)) throw messageNotFound();
  const message = await MessageModel.findById(messageId).exec();
  if (message === null) throw messageNotFound();
  const conversation = await getOwnedConversation(
    context,
    message.conversationId.toString(),
  );
  return { message, conversation };
}

async function getMessageUserState(
  message: MessageDocument,
  userId: string,
): Promise<MessageUserStateEntity | null> {
  return MessageUserStateModel.findOne({
    messageId: message._id,
    userId: new Types.ObjectId(userId),
  }).exec();
}

async function upsertMessageUserState(
  message: MessageDocument,
  userId: string,
  changes: Partial<
    Pick<MessageUserStateEntity, "hidden" | "favorite" | "pinned">
  >,
) {
  return MessageUserStateModel.findOneAndUpdate(
    { messageId: message._id, userId: new Types.ObjectId(userId) },
    {
      $set: changes,
      $setOnInsert: {
        messageId: message._id,
        conversationId: message.conversationId,
        userId: new Types.ObjectId(userId),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();
}

function stateEvent(
  message: MessageDocument,
  userId: string,
  state: MessageUserStateEntity,
): MessageUserStateUpdatedEvent {
  return {
    messageId: message._id.toString(),
    conversationId: message.conversationId.toString(),
    userId,
    hidden: state.hidden,
    favorite: state.favorite,
    pinned: state.pinned,
  };
}

export interface DeleteForMeResult {
  messageId: string;
  conversationId: string;
  deletedForMe: true;
}

export async function deleteMessageForMe(
  context: AuthContext,
  messageId: string,
): Promise<DeleteForMeResult> {
  const { message } = await getMessageActionContext(context, messageId);
  const state = await upsertMessageUserState(message, context.userId, {
    hidden: true,
    favorite: false,
    pinned: false,
  });
  if (state === null) throw messageNotFound();
  publishMessageUserStateUpdated(stateEvent(message, context.userId, state));
  return {
    messageId: message._id.toString(),
    conversationId: message.conversationId.toString(),
    deletedForMe: true,
  };
}

export async function deleteMessageForEveryone(
  context: AuthContext,
  messageId: string,
): Promise<MessageDto> {
  const { message, conversation } = await getMessageActionContext(
    context,
    messageId,
  );
  if (message.senderId.toString() !== context.userId) {
    throw messageActionNotAllowed(
      "DELETE_FOR_EVERYONE_FORBIDDEN",
      "Only the sender can delete this message for everyone.",
    );
  }
  if (message.deletedForEveryoneAt == null) {
    message.deletedForEveryoneAt = new Date();
    message.deletedForEveryoneBy = new Types.ObjectId(context.userId);
    message.text = null;
    message.media = null;
    message.reactions = [];
    message.editedAt = null;
    message.pinnedForEveryoneAt = null;
    message.pinnedForEveryoneBy = null;
    await message.save();
    await MessageUserStateModel.updateMany(
      { messageId: message._id },
      { $set: { favorite: false, pinned: false } },
    ).exec();
  }
  const dto = toMessageDto(message, conversation, context.userId);
  const recipientId = getOtherParticipant(
    conversation,
    context.userId,
  ).toString();
  publishMessageDeleted({
    message: dto,
    recipientId,
    senderId: context.userId,
  });
  return dto;
}

export async function editMessage(
  context: AuthContext,
  messageId: string,
  text: string,
): Promise<MessageDto> {
  const { message, conversation } = await getMessageActionContext(
    context,
    messageId,
  );
  if (message.senderId.toString() !== context.userId) {
    throw messageActionNotAllowed(
      "MESSAGE_EDIT_FORBIDDEN",
      "Only the sender can edit this message.",
    );
  }
  if (message.deletedForEveryoneAt != null) throw deletedMessageNotEditable();
  if (message.e2efeVersion !== null) {
    throw new AppError({
      code: "E2EFE_EDIT_REQUIRES_ENCRYPTED_REVISION",
      message:
        "Encrypted messages must be edited through the encrypted client.",
      statusCode: 409,
    });
  }
  if (message.type !== "text") {
    throw new AppError({
      code: "MESSAGE_TYPE_NOT_EDITABLE",
      message: "Only text messages can be edited.",
      statusCode: 400,
    });
  }
  message.text = text;
  message.editedAt = new Date();
  await message.save();
  const dto = toMessageDto(message, conversation, context.userId);
  publishMessageUpdated({
    message: dto,
    recipientId: getOtherParticipant(conversation, context.userId).toString(),
    senderId: context.userId,
  });
  return dto;
}

export interface MessagePersonalStateResult {
  messageId: string;
  conversationId: string;
  favorite: boolean;
  pinned: boolean;
}

export async function setMessageFavorite(
  context: AuthContext,
  messageId: string,
  favorite: boolean,
): Promise<MessagePersonalStateResult> {
  const { message } = await getMessageActionContext(context, messageId);
  if (message.deletedForEveryoneAt != null) throw deletedMessageNotEditable();
  const state = await upsertMessageUserState(message, context.userId, {
    favorite,
  });
  if (state === null) throw messageNotFound();
  publishMessageUserStateUpdated(stateEvent(message, context.userId, state));
  return {
    messageId: message._id.toString(),
    conversationId: message.conversationId.toString(),
    favorite: state.favorite,
    pinned: state.pinned,
  };
}

export async function setMessagePin(
  context: AuthContext,
  messageId: string,
  scope: "me" | "everyone",
  pinned: boolean,
): Promise<MessageDto> {
  const { message, conversation } = await getMessageActionContext(
    context,
    messageId,
  );
  if (message.deletedForEveryoneAt != null) throw deletedMessageNotEditable();
  if (scope === "me") {
    const state = await upsertMessageUserState(message, context.userId, {
      pinned,
    });
    if (state === null) throw messageNotFound();
    publishMessageUserStateUpdated(stateEvent(message, context.userId, state));
    return toMessageDto(message, conversation, context.userId, state);
  }

  const otherPinned = pinned
    ? await MessageModel.findOne({
        conversationId: conversation._id,
        _id: { $ne: message._id },
        pinnedForEveryoneAt: { $ne: null },
      }).exec()
    : null;
  if (otherPinned !== null) {
    otherPinned.pinnedForEveryoneAt = null;
    otherPinned.pinnedForEveryoneBy = null;
    await otherPinned.save();
    const oldDto = toMessageDto(otherPinned, conversation, context.userId);
    publishMessageUpdated({
      message: oldDto,
      recipientId: getOtherParticipant(conversation, context.userId).toString(),
      senderId: context.userId,
    });
  }
  message.pinnedForEveryoneAt = pinned ? new Date() : null;
  message.pinnedForEveryoneBy = pinned
    ? new Types.ObjectId(context.userId)
    : null;
  await message.save();
  const dto = toMessageDto(message, conversation, context.userId);
  publishMessageUpdated({
    message: dto,
    recipientId: getOtherParticipant(conversation, context.userId).toString(),
    senderId: context.userId,
  });
  return dto;
}

export async function updateMessageReaction(
  context: AuthContext,
  messageId: string,
  input: MessageReactionInput | null,
): Promise<MessageDto> {
  if (!Types.ObjectId.isValid(messageId)) throw messageNotFound();
  const message = await MessageModel.findById(messageId).exec();
  if (message === null) throw messageNotFound();
  if (message.deletedForEveryoneAt != null) throw deletedMessageNotEditable();
  const conversation = await getOwnedConversation(
    context,
    message.conversationId.toString(),
  );
  const userId = new Types.ObjectId(context.userId);
  const reactions = (message.reactions ?? []).filter(
    (reaction) => !reaction.userId.equals(userId),
  );
  if (input !== null) {
    reactions.push({
      userId,
      emoji: input.emoji,
      reactedAt: new Date(),
    });
  }
  message.reactions = reactions;
  await message.save();
  const dto = toMessageDto(message, conversation, context.userId);
  const recipientId = getOtherParticipant(
    conversation,
    context.userId,
  ).toString();
  publishMessageReactionUpdated({
    message: dto,
    recipientId,
    senderId: context.userId,
  });
  return dto;
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
          "participants.$[reader].manualUnread": false,
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
  await MessageUserStateModel.init();
}
