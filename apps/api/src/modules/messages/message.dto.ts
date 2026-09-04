import type { MessageDto } from "@terqivo/contracts";

import type { ConversationDocument } from "../conversations/conversation.types.js";
import type { MessageDocument } from "./message.types.js";

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
): MessageDto {
  return {
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    clientMessageId: message.clientMessageId,
    type: message.type,
    text: message.text,
    media: message.media ?? null,
    sequence: message.sequence,
    status: getMessageStatus(message, conversation, currentUserId),
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}
