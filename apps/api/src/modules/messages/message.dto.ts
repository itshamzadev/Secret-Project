import type { MessageDto } from "@terqivo/contracts";

import type { ConversationDocument } from "../conversations/conversation.types.js";
import type { MessageDocument } from "./message.types.js";
import type { MessageUserStateEntity } from "./message-user-state.model.js";
import type { E2EFEMessageEnvelopeDocument } from "../e2efe/e2efe-message-envelope.types.js";

export function getMessageStatus(
  message: MessageDocument,
  conversation: ConversationDocument,
  currentUserId: string,
): MessageDto["status"] {
  if (message.senderId.toString() !== currentUserId) {
    const state = conversation.participants.find(
      (participant) => participant.userId.toString() === currentUserId,
    );
    if (state === undefined) {
      return "sent";
    }
    if (state.lastReadSequence >= message.sequence) {
      return "read";
    }
    if (state.lastDeliveredSequence >= message.sequence) {
      return "delivered";
    }
    return "sent";
  }

  const recipientState = conversation.participants.find(
    (participant) => participant.userId.toString() !== currentUserId,
  );
  if (
    recipientState?.lastReadSequence !== undefined &&
    recipientState.lastReadSequence >= message.sequence
  ) {
    return "read";
  }
  if (
    recipientState?.lastDeliveredSequence !== undefined &&
    recipientState.lastDeliveredSequence >= message.sequence
  ) {
    return "delivered";
  }
  return "sent";
}

export function toMessageDto(
  message: MessageDocument,
  conversation: ConversationDocument,
  currentUserId: string,
  userState?: MessageUserStateEntity | null,
  encryptedEnvelope?: E2EFEMessageEnvelopeDocument | null,
): MessageDto {
  const deletedForEveryone = message.deletedForEveryoneAt != null;
  const encrypted = message.e2efeVersion != null;
  return {
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    clientMessageId: message.clientMessageId,
    type: message.type,
    // Encrypted messages must never expose a plaintext text field, even if a
    // malformed/migrated document contains stale data beside the ciphertext.
    text: deletedForEveryone || encrypted ? null : message.text,
    media: deletedForEveryone ? null : (message.media ?? null),
    reactions: deletedForEveryone
      ? []
      : (message.reactions ?? []).map((reaction) => ({
          userId: reaction.userId.toString(),
          emoji: reaction.emoji,
          reactedAt: reaction.reactedAt.toISOString(),
        })),
    sequence: message.sequence,
    status: getMessageStatus(message, conversation, currentUserId),
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedForEveryoneAt: message.deletedForEveryoneAt?.toISOString() ?? null,
    deletedForEveryoneBy: message.deletedForEveryoneBy?.toString() ?? null,
    isDeletedForEveryone: deletedForEveryone,
    isFavorite: userState?.favorite === true,
    isPinnedForMe: userState?.pinned === true,
    isPinnedForEveryone: message.pinnedForEveryoneAt != null,
    e2efeVersion: message.e2efeVersion ?? null,
    senderDeviceId: message.senderDeviceId ?? null,
    encryptedEnvelope:
      encryptedEnvelope === undefined || encryptedEnvelope === null
        ? null
        : {
            messageId: encryptedEnvelope.messageId.toString(),
            conversationId: encryptedEnvelope.conversationId.toString(),
            senderId: encryptedEnvelope.senderId.toString(),
            senderDeviceId: encryptedEnvelope.senderDeviceId,
            recipientUserId: encryptedEnvelope.recipientUserId.toString(),
            recipientDeviceId: encryptedEnvelope.recipientDeviceId,
            e2efeVersion: encryptedEnvelope.e2efeVersion,
            envelopeType: encryptedEnvelope.envelopeType,
            ciphertext: encryptedEnvelope.ciphertext,
            createdAt: encryptedEnvelope.createdAt.toISOString(),
          },
  };
}
