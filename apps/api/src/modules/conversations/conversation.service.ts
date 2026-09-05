import type { ConversationDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { decodeCursor, encodeCursor } from "../../utils/cursors.js";
import { isMongoDuplicateKeyError } from "../../utils/mongo.js";
import { ContactModel } from "../contacts/contact.model.js";
import { MessageModel } from "../messages/message.model.js";
import { UserModel } from "../users/user.model.js";
import type { AuthContext } from "../auth/auth.types.js";
import { ConversationModel } from "./conversation.model.js";
import { toConversationDto } from "./conversation.dto.js";
import type {
  CreateDirectConversationInput,
  ConversationListQuery,
} from "./conversation.validation.js";
import type { ConversationDocument } from "./conversation.types.js";
import { assertUsersCanInteract } from "../privacy/block.service.js";

function conversationNotFound(): AppError {
  return new AppError({
    code: "CONVERSATION_NOT_FOUND",
    message: "The conversation was not found.",
    statusCode: 404,
  });
}

function currentUserId(context: AuthContext): Types.ObjectId {
  return new Types.ObjectId(context.userId);
}

export function directConversationKey(
  firstUserId: string,
  secondUserId: string,
): string {
  return [firstUserId, secondUserId].sort().join(":");
}

export async function createOrGetDirectConversation(
  context: AuthContext,
  input: CreateDirectConversationInput,
): Promise<ConversationDocument> {
  const ownerId = currentUserId(context);
  const targetId = new Types.ObjectId(input.userId);
  if (ownerId.equals(targetId)) {
    throw new AppError({
      code: "CANNOT_MESSAGE_SELF",
      message: "You cannot create a direct conversation with yourself.",
      statusCode: 400,
    });
  }
  await assertUsersCanInteract(context.userId, input.userId);

  const target = await UserModel.findOne({
    _id: targetId,
    accountStatus: "active",
  }).exec();
  if (target === null) {
    throw conversationNotFound();
  }

  const directKey = directConversationKey(context.userId, input.userId);
  try {
    return await ConversationModel.findOneAndUpdate(
      { directKey },
      {
        $setOnInsert: {
          type: "direct",
          directKey,
          participants: [
            { userId: ownerId, joinedAt: new Date() },
            { userId: targetId, joinedAt: new Date() },
          ],
          messageSequence: 0,
          lastMessageId: null,
          lastMessageAt: null,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ).exec();
  } catch (error) {
    if (!isMongoDuplicateKeyError(error)) {
      throw error;
    }
    const existing = await ConversationModel.findOne({ directKey }).exec();
    if (existing === null) {
      throw error;
    }
    return existing;
  }
}

export async function getOwnedConversation(
  context: AuthContext,
  conversationId: string,
): Promise<ConversationDocument> {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw conversationNotFound();
  }

  const conversation = await ConversationModel.findOne({
    _id: new Types.ObjectId(conversationId),
    "participants.userId": currentUserId(context),
  }).exec();
  if (conversation === null) {
    throw conversationNotFound();
  }
  return conversation;
}

export function getOtherParticipant(
  conversation: ConversationDocument,
  userId: string,
): Types.ObjectId {
  const participant = conversation.participants.find(
    (value) => value.userId.toString() !== userId,
  );
  if (participant === undefined) {
    throw conversationNotFound();
  }
  return participant.userId;
}

export async function listConversations(
  context: AuthContext,
  query: ConversationListQuery,
): Promise<{ conversations: ConversationDto[]; nextCursor: string | null }> {
  const ownerId = currentUserId(context);
  const cursor = decodeCursor(query.cursor);
  const filter: Record<string, unknown> = {
    "participants.userId": ownerId,
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
      { lastMessageAt: { $lt: cursorDate } },
      { lastMessageAt: null },
      {
        lastMessageAt: cursorDate,
        _id: { $lt: new Types.ObjectId(cursor.id) },
      },
    ];
  }

  const conversations = await ConversationModel.find(filter)
    .sort({ lastMessageAt: -1, createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .exec();
  const hasNext = conversations.length > query.limit;
  const page = hasNext ? conversations.slice(0, query.limit) : conversations;
  const otherIds = page.map((conversation) =>
    getOtherParticipant(conversation, context.userId),
  );
  const [users, contacts, messages] = await Promise.all([
    UserModel.find({ _id: { $in: otherIds } }).exec(),
    ContactModel.find({ ownerId, contactUserId: { $in: otherIds } }).exec(),
    MessageModel.find({
      _id: {
        $in: page.flatMap((conversation) => conversation.lastMessageId ?? []),
      },
    }).exec(),
  ]);
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const contactsByUserId = new Map(
    contacts.map((contact) => [contact.contactUserId.toString(), contact]),
  );
  const messagesById = new Map(
    messages.map((message) => [message._id.toString(), message]),
  );
  const result = page.flatMap((conversation) => {
    const participantId = getOtherParticipant(conversation, context.userId);
    const participant = usersById.get(participantId.toString());
    if (participant === undefined) {
      return [];
    }
    const message =
      conversation.lastMessageId === null
        ? null
        : (messagesById.get(conversation.lastMessageId.toString()) ?? null);
    return [
      toConversationDto(
        conversation,
        context.userId,
        participant,
        contactsByUserId.get(participantId.toString()) ?? null,
        message,
      ),
    ];
  });
  const last = page.at(-1);
  const activityDate = last?.lastMessageAt ?? last?.createdAt;

  return {
    conversations: result,
    nextCursor:
      hasNext && last !== undefined && activityDate !== undefined
        ? encodeCursor({
            createdAt: activityDate.toISOString(),
            id: last._id.toString(),
          })
        : null,
  };
}

export async function getConversationParticipantIds(
  userId: string,
): Promise<string[]> {
  if (!Types.ObjectId.isValid(userId)) {
    return [];
  }

  const conversations = await ConversationModel.find({
    "participants.userId": new Types.ObjectId(userId),
  })
    .select("participants.userId")
    .lean<Array<{ participants: Array<{ userId: Types.ObjectId }> }>>()
    .exec();

  return [
    ...new Set(
      conversations.flatMap((conversation) =>
        conversation.participants
          .map((participant) => participant.userId.toString())
          .filter((participantId) => participantId !== userId),
      ),
    ),
  ];
}

export async function setConversationUnread(
  context: AuthContext,
  conversationId: string,
  unread: boolean,
): Promise<ConversationDocument> {
  const conversation = await getOwnedConversation(context, conversationId);
  const updated = await ConversationModel.findOneAndUpdate(
    { _id: conversation._id },
    {
      $set: {
        "participants.$[participant].manualUnread": unread,
        ...(unread ? {} : { "participants.$[participant].unreadCount": 0 }),
      },
    },
    {
      arrayFilters: [{ "participant.userId": currentUserId(context) }],
      returnDocument: "after",
    },
  ).exec();
  if (updated === null) throw conversationNotFound();
  return updated;
}

export async function clearConversationForUser(
  context: AuthContext,
  conversationId: string,
): Promise<ConversationDocument> {
  const conversation = await getOwnedConversation(context, conversationId);
  const updated = await ConversationModel.findOneAndUpdate(
    { _id: conversation._id },
    {
      $set: {
        "participants.$[participant].clearedAt": new Date(),
        "participants.$[participant].manualUnread": false,
        "participants.$[participant].unreadCount": 0,
      },
    },
    {
      arrayFilters: [{ "participant.userId": currentUserId(context) }],
      returnDocument: "after",
    },
  ).exec();
  if (updated === null) throw conversationNotFound();
  return updated;
}

export async function setConversationMute(
  context: AuthContext,
  conversationId: string,
  duration: "8h" | "1w" | "always" | null,
): Promise<ConversationDocument> {
  const conversation = await getOwnedConversation(context, conversationId);
  const mutedUntil =
    duration === null
      ? null
      : duration === "always"
        ? null
        : new Date(
            Date.now() + (duration === "8h" ? 8 : 24 * 7) * 60 * 60 * 1000,
          );
  const updated = await ConversationModel.findOneAndUpdate(
    { _id: conversation._id },
    {
      $set: {
        "participants.$[participant].mutedUntil": mutedUntil,
        "participants.$[participant].muted": duration !== null,
      },
    },
    {
      arrayFilters: [{ "participant.userId": currentUserId(context) }],
      returnDocument: "after",
    },
  ).exec();
  if (updated === null) throw conversationNotFound();
  return updated;
}

export async function isConversationMuted(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  if (
    !Types.ObjectId.isValid(conversationId) ||
    !Types.ObjectId.isValid(userId)
  ) {
    return false;
  }
  const conversation = await ConversationModel.findOne({
    _id: new Types.ObjectId(conversationId),
  })
    .select({ participants: 1 })
    .exec();
  const state = conversation?.participants.find(
    (participant) => participant.userId.toString() === userId,
  );
  return (
    state?.muted === true &&
    (state.mutedUntil === null || state.mutedUntil.getTime() > Date.now())
  );
}

export async function initializeConversationModels(): Promise<void> {
  await ConversationModel.init();
}
