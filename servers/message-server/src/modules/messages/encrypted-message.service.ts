import type {
  E2EFEEncryptedMessageData,
  E2EFEEncryptedMediaInput,
  E2EFEEncryptedMessageEditInput,
  E2EFEEncryptedMessageInput,
  E2EFEMessageEnvelopeDto,
} from "../../contracts/index.js";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import type { AuthContext } from "../auth/auth.types.js";
import {
  getOtherParticipant,
  getOwnedConversation,
} from "../conversations/conversation.service.js";
import { ConversationModel } from "../conversations/conversation.model.js";
import type { ConversationDocument } from "../conversations/conversation.types.js";
import { assertUsersCanInteract } from "../privacy/block.service.js";
import { dispatchNewDirectMessage } from "../notifications/push.service.js";
import { E2EFEDeviceModel } from "../e2efe/e2efe-device.model.js";
import { E2EFEMessageEnvelopeModel } from "../e2efe/e2efe-message-envelope.model.js";
import type { E2EFEMessageEnvelopeDocument } from "../e2efe/e2efe-message-envelope.types.js";
import { toMessageDto } from "./message.dto.js";
import { MessageModel } from "./message.model.js";
import type { MessageDocument } from "./message.types.js";
import { MessageUserStateModel } from "./message-user-state.model.js";
import { publishEncryptedMessageCreated } from "./message.events.js";
import { publishEncryptedMessageUpdated } from "./message.events.js";
import { getMessageActionContext } from "./message.service.js";
import { isMongoDuplicateKeyError } from "../../utils/mongo.js";

function e2efeError(
  code: string,
  message: string,
  statusCode: number,
): AppError {
  return new AppError({ code, message, statusCode });
}

function envelopeDto(
  envelope: E2EFEMessageEnvelopeDocument,
): E2EFEMessageEnvelopeDto {
  return {
    messageId: envelope.messageId.toString(),
    conversationId: envelope.conversationId.toString(),
    senderId: envelope.senderId.toString(),
    senderDeviceId: envelope.senderDeviceId,
    recipientUserId: envelope.recipientUserId.toString(),
    recipientDeviceId: envelope.recipientDeviceId,
    e2efeVersion: envelope.e2efeVersion,
    envelopeType: envelope.envelopeType,
    ciphertext: envelope.ciphertext,
    createdAt: envelope.createdAt.toISOString(),
  };
}

function findExistingEncryptedMessage(
  context: AuthContext,
  clientMessageId: string,
): Promise<MessageDocument | null> {
  return MessageModel.findOne({
    senderId: new Types.ObjectId(context.userId),
    clientMessageId,
  }).exec();
}

function getMessageUserStateForService(
  message: MessageDocument,
  userId: string,
) {
  return MessageUserStateModel.findOne({
    messageId: message._id,
    userId: new Types.ObjectId(userId),
  }).exec();
}

async function currentConversationResult(
  context: AuthContext,
  conversationId: string,
  existing: MessageDocument,
): Promise<
  E2EFEEncryptedMessageData & {
    conversation: ConversationDocument;
    recipientId: string;
  }
> {
  if (existing.e2efeVersion === null) {
    throw e2efeError(
      "CLIENT_MESSAGE_ID_CONFLICT",
      "The client message identifier is already used by a legacy message.",
      409,
    );
  }
  const conversation = await getOwnedConversation(context, conversationId);
  const envelopes = await E2EFEMessageEnvelopeModel.find({
    messageId: existing._id,
  })
    .sort({ recipientUserId: 1, recipientDeviceId: 1 })
    .exec();
  return {
    message: toMessageDto(
      existing,
      conversation,
      context.userId,
      await getMessageUserStateForService(existing, context.userId),
    ),
    envelopes: envelopes.map(envelopeDto),
    duplicate: true,
    conversation,
    recipientId: getOtherParticipant(conversation, context.userId).toString(),
  };
}

type EncryptedSendInput = E2EFEEncryptedMessageInput | E2EFEEncryptedMediaInput;

async function sendEncryptedPayload(
  context: AuthContext,
  conversationId: string,
  input: EncryptedSendInput,
): Promise<
  E2EFEEncryptedMessageData & {
    conversation: ConversationDocument;
    recipientId: string;
  }
> {
  const existing = await findExistingEncryptedMessage(
    context,
    input.clientMessageId,
  );
  if (existing !== null) {
    if (existing.conversationId.toString() !== conversationId) {
      throw e2efeError(
        "CLIENT_MESSAGE_ID_CONFLICT",
        "The client message identifier is already used elsewhere.",
        409,
      );
    }
    return currentConversationResult(context, conversationId, existing);
  }

  const conversation = await getOwnedConversation(context, conversationId);
  const recipientId = getOtherParticipant(conversation, context.userId);
  await assertUsersCanInteract(context.userId, recipientId.toString());

  const senderId = new Types.ObjectId(context.userId);
  const senderDevice = await E2EFEDeviceModel.findOne({
    userId: senderId,
    deviceId: input.senderDeviceId,
    active: true,
    protocolVersion: input.e2efeVersion,
  })
    .select({ _id: 1 })
    .exec();
  if (senderDevice === null) {
    throw e2efeError(
      "E2EFE_SENDER_DEVICE_NOT_REGISTERED",
      "This encryption device is not registered. Please retry after setup.",
      409,
    );
  }

  const recipientDevices = await E2EFEDeviceModel.find({
    userId: recipientId,
    active: true,
    protocolVersion: input.e2efeVersion,
  })
    .select({ deviceId: 1 })
    .exec();
  if (recipientDevices.length === 0) {
    throw e2efeError(
      "E2EFE_RECIPIENT_NOT_READY",
      "The recipient has not enabled encrypted messaging yet.",
      409,
    );
  }

  const senderDevices = await E2EFEDeviceModel.find({
    userId: senderId,
    active: true,
    protocolVersion: input.e2efeVersion,
  })
    .select({ deviceId: 1 })
    .exec();
  const activeDeviceKeys = new Set([
    ...recipientDevices.map((device) => `${recipientId}:${device.deviceId}`),
    ...senderDevices.map((device) => `${senderId}:${device.deviceId}`),
  ]);
  const envelopeKeys = new Set<string>();
  for (const envelope of input.envelopes) {
    const key = `${envelope.recipientUserId}:${envelope.recipientDeviceId}`;
    if (!activeDeviceKeys.has(key)) {
      throw e2efeError(
        "E2EFE_RECIPIENT_DEVICE_INVALID",
        "One or more encrypted recipient devices are no longer active.",
        409,
      );
    }
    envelopeKeys.add(key);
  }
  for (const device of recipientDevices) {
    if (!envelopeKeys.has(`${recipientId}:${device.deviceId}`)) {
      throw e2efeError(
        "E2EFE_RECIPIENT_DEVICE_MISSING",
        "The encrypted message is missing an active recipient device.",
        409,
      );
    }
  }

  const updatedConversation = await ConversationModel.findOneAndUpdate(
    {
      _id: conversation._id,
      "participants.userId": senderId,
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
    throw e2efeError(
      "CONVERSATION_NOT_FOUND",
      "The conversation was not found.",
      404,
    );
  }

  const now = new Date();
  let message: MessageDocument;
  try {
    message = await MessageModel.create({
      conversationId: conversation._id,
      senderId,
      clientMessageId: input.clientMessageId,
      type: input.type,
      text: null,
      media: input.type === "text" ? null : input.media,
      e2efeVersion: input.e2efeVersion,
      senderDeviceId: input.senderDeviceId,
      replyToMessageId: null,
      sequence: updatedConversation.messageSequence,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    // Two retries can pass the initial lookup concurrently. The unique
    // sender/clientMessageId index remains authoritative and the loser must
    // resolve to the already-created logical message, never create another.
    if (isMongoDuplicateKeyError(error)) {
      const concurrent = await findExistingEncryptedMessage(
        context,
        input.clientMessageId,
      );
      if (concurrent !== null) {
        if (concurrent.conversationId.toString() !== conversationId) {
          throw e2efeError(
            "CLIENT_MESSAGE_ID_CONFLICT",
            "The client message identifier is already used elsewhere.",
            409,
          );
        }
        return currentConversationResult(context, conversationId, concurrent);
      }
    }
    throw error;
  }
  await ConversationModel.updateOne(
    { _id: conversation._id },
    { $set: { lastMessageId: message._id, lastMessageAt: now } },
  ).exec();

  const storedEnvelopes = await E2EFEMessageEnvelopeModel.insertMany(
    input.envelopes.map((envelope) => ({
      messageId: message._id,
      conversationId: conversation._id,
      senderId,
      senderDeviceId: input.senderDeviceId,
      recipientUserId: new Types.ObjectId(envelope.recipientUserId),
      recipientDeviceId: envelope.recipientDeviceId,
      e2efeVersion: input.e2efeVersion,
      envelopeType: envelope.envelopeType,
      ciphertext: envelope.ciphertext,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const currentConversation = await getOwnedConversation(
    context,
    conversationId,
  );
  const messageData = {
    message: toMessageDto(message, currentConversation, context.userId),
    envelopes: storedEnvelopes.map(envelopeDto),
    duplicate: false,
  };

  // Push receives the same ciphertext-free DTO as the rest of the server;
  // notificationPreview therefore emits only a generic encrypted-message label.
  void dispatchNewDirectMessage({
    message: messageData.message,
    recipientId: recipientId.toString(),
    senderId: context.userId,
  });
  for (const envelope of storedEnvelopes) {
    publishEncryptedMessageCreated({
      message: messageData.message,
      envelope: envelopeDto(envelope),
      recipientId: envelope.recipientUserId.toString(),
      senderId: context.userId,
    });
  }

  return {
    ...messageData,
    conversation: currentConversation,
    recipientId: recipientId.toString(),
  };
}

export async function sendEncryptedMessage(
  context: AuthContext,
  conversationId: string,
  input: E2EFEEncryptedMessageInput,
): Promise<
  E2EFEEncryptedMessageData & {
    conversation: ConversationDocument;
    recipientId: string;
  }
> {
  return sendEncryptedPayload(context, conversationId, input);
}

export async function sendEncryptedMediaMessage(
  context: AuthContext,
  conversationId: string,
  input: E2EFEEncryptedMediaInput,
): Promise<
  E2EFEEncryptedMessageData & {
    conversation: ConversationDocument;
    recipientId: string;
  }
> {
  return sendEncryptedPayload(context, conversationId, input);
}

export async function editEncryptedMessage(
  context: AuthContext,
  messageId: string,
  input: E2EFEEncryptedMessageEditInput,
): Promise<E2EFEEncryptedMessageData> {
  const { message, conversation } = await getMessageActionContext(
    context,
    messageId,
  );
  if (message.senderId.toString() !== context.userId) {
    throw e2efeError(
      "MESSAGE_EDIT_FORBIDDEN",
      "Only the sender can edit this message.",
      403,
    );
  }
  if (message.deletedForEveryoneAt !== null) {
    throw e2efeError(
      "MESSAGE_DELETED_FOR_EVERYONE",
      "A deleted message cannot be changed.",
      409,
    );
  }
  if (message.e2efeVersion === null || message.type !== "text") {
    throw e2efeError(
      "E2EFE_MESSAGE_NOT_EDITABLE",
      "This message is not an encrypted text message.",
      400,
    );
  }

  const senderId = new Types.ObjectId(context.userId);
  const senderDevice = await E2EFEDeviceModel.findOne({
    userId: senderId,
    deviceId: input.senderDeviceId,
    active: true,
    protocolVersion: input.e2efeVersion,
  })
    .select({ _id: 1 })
    .exec();
  if (senderDevice === null) {
    throw e2efeError(
      "E2EFE_SENDER_DEVICE_NOT_REGISTERED",
      "This encryption device is not registered. Please retry after setup.",
      409,
    );
  }

  const recipientId = getOtherParticipant(conversation, context.userId);
  await assertUsersCanInteract(context.userId, recipientId.toString());
  const recipientDevices = await E2EFEDeviceModel.find({
    userId: recipientId,
    active: true,
    protocolVersion: input.e2efeVersion,
  })
    .select({ deviceId: 1 })
    .exec();
  const destinationKeys = new Set(
    input.envelopes.map(
      (envelope) => `${envelope.recipientUserId}:${envelope.recipientDeviceId}`,
    ),
  );
  for (const device of recipientDevices) {
    if (!destinationKeys.has(`${recipientId}:${device.deviceId}`)) {
      throw e2efeError(
        "E2EFE_RECIPIENT_DEVICE_MISSING",
        "The encrypted revision is missing an active recipient device.",
        409,
      );
    }
  }
  if (recipientDevices.length === 0) {
    throw e2efeError(
      "E2EFE_RECIPIENT_NOT_READY",
      "The recipient has no compatible encrypted devices.",
      409,
    );
  }

  const currentEnvelopes = await E2EFEMessageEnvelopeModel.find({
    messageId: message._id,
    recipientUserId: recipientId,
  }).exec();
  const currentByKey = new Set(
    currentEnvelopes.map(
      (envelope) => `${envelope.recipientUserId}:${envelope.recipientDeviceId}`,
    ),
  );
  if (
    recipientDevices.some(
      (device) => !currentByKey.has(`${recipientId}:${device.deviceId}`),
    )
  ) {
    throw e2efeError(
      "E2EFE_REVISION_DESTINATIONS_NOT_READY",
      "This encrypted message cannot be edited until all recipient sessions are ready.",
      409,
    );
  }

  if (message.e2efeRevisionId === input.revisionId) {
    const existingConversation = await getOwnedConversation(
      context,
      message.conversationId.toString(),
    );
    const envelopes = await E2EFEMessageEnvelopeModel.find({
      messageId: message._id,
    })
      .sort({ recipientUserId: 1, recipientDeviceId: 1 })
      .exec();
    return {
      message: toMessageDto(message, existingConversation, context.userId),
      envelopes: envelopes.map(envelopeDto),
      duplicate: true,
    };
  }

  const now = new Date();
  for (const envelope of input.envelopes) {
    const updated = await E2EFEMessageEnvelopeModel.updateOne(
      {
        messageId: message._id,
        recipientUserId: new Types.ObjectId(envelope.recipientUserId),
        recipientDeviceId: envelope.recipientDeviceId,
      },
      {
        $set: {
          ciphertext: envelope.ciphertext,
          envelopeType: envelope.envelopeType,
          e2efeVersion: input.e2efeVersion,
          updatedAt: now,
        },
      },
    ).exec();
    if (updated.matchedCount !== 1) {
      throw e2efeError(
        "E2EFE_REVISION_DESTINATION_INVALID",
        "An encrypted recipient session is no longer available.",
        409,
      );
    }
  }
  message.e2efeRevisionId = input.revisionId;
  message.editedAt = now;
  await message.save();
  const currentConversation = await getOwnedConversation(
    context,
    message.conversationId.toString(),
  );
  const storedEnvelopes = await E2EFEMessageEnvelopeModel.find({
    messageId: message._id,
  })
    .sort({ recipientUserId: 1, recipientDeviceId: 1 })
    .exec();
  const messageData = {
    message: toMessageDto(message, currentConversation, context.userId),
    envelopes: storedEnvelopes.map(envelopeDto),
    duplicate: false,
  };
  for (const envelope of storedEnvelopes) {
    publishEncryptedMessageUpdated({
      message: messageData.message,
      envelope: envelopeDto(envelope),
      recipientId: envelope.recipientUserId.toString(),
      senderId: context.userId,
    });
  }
  return messageData;
}
