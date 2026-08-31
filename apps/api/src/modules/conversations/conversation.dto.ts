import type {
  ContactUserDto,
  ConversationDto,
  MessageDto,
} from "@terqivo/contracts";

import { toContactUserDto } from "../contacts/contact.dto.js";
import type { ContactDocument } from "../contacts/contact.types.js";
import type { UserDocument } from "../users/user.types.js";
import type { MessageDocument } from "../messages/message.types.js";
import type { ConversationDocument } from "./conversation.types.js";
import { toMessageDto } from "../messages/message.dto.js";

export function toConversationDto(
  conversation: ConversationDocument,
  currentUserId: string,
  participantUser: UserDocument,
  contact: ContactDocument | null,
  lastMessage: MessageDocument | null,
): ConversationDto {
  const participant: ContactUserDto = toContactUserDto(participantUser);
  const participantState = conversation.participants.find(
    (value) => value.userId.toString() === currentUserId,
  );
  const message: MessageDto | null =
    lastMessage === null || participantState === undefined
      ? null
      : toMessageDto(lastMessage, conversation, currentUserId);

  return {
    id: conversation._id.toString(),
    type: conversation.type,
    participant: {
      user: participant,
      customName: contact?.customName ?? null,
    },
    lastMessage: message,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    unreadCount: participantState?.unreadCount ?? 0,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}
