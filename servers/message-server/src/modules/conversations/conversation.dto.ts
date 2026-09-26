import type {
  ContactUserDto,
  ConversationDto,
  MessageDto,
} from "../../contracts/index.js";

import { toContactUserDto } from "../contacts/contact.dto.js";
import type { UserDocument } from "../users/user.types.js";
import type { MessageDocument } from "../messages/message.types.js";
import type { ConversationDocument } from "./conversation.types.js";
import { toMessageDto } from "../messages/message.dto.js";
import type { MessageUserStateEntity } from "../messages/message-user-state.model.js";

export function toConversationDto(
  conversation: ConversationDocument,
  currentUserId: string,
  participantUser: UserDocument,
  contact: { customName: string | null } | null,
  lastMessage: MessageDocument | null,
  messageState?: MessageUserStateEntity | null,
): ConversationDto {
  const participant: ContactUserDto = toContactUserDto(participantUser);
  const participantState = conversation.participants.find(
    (value) => value.userId.toString() === currentUserId,
  );
  const message: MessageDto | null =
    lastMessage === null ||
    participantState === undefined ||
    messageState?.hidden === true ||
    (participantState.clearedAt !== null &&
      lastMessage.createdAt <= participantState.clearedAt &&
      messageState?.favorite !== true)
      ? null
      : toMessageDto(lastMessage, conversation, currentUserId, messageState);

  return {
    id: conversation._id.toString(),
    type: conversation.type,
    participant: {
      user: participant,
      customName: contact?.customName ?? null,
    },
    lastMessage: message,
    lastMessageAt: message === null ? null : message.createdAt,
    unreadCount: participantState?.unreadCount ?? 0,
    mutedUntil: participantState?.mutedUntil?.toISOString() ?? null,
    muted: participantState?.muted ?? false,
    manualUnread: participantState?.manualUnread ?? false,
    clearedAt: participantState?.clearedAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}
