import type { ConversationDto } from "../../contracts/index.js";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { decodeCursor, encodeCursor } from "../../utils/cursors.js";
import { isMongoDuplicateKeyError } from "../../utils/mongo.js";
import { MessageModel } from "../messages/message.model.js";
import type { MessageDocument } from "../messages/message.types.js";
import type { MessageUserStateEntity } from "../messages/message-user-state.model.js";
import { MessageUserStateModel } from "../messages/message-user-state.model.js";
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
import { publishConversationCleared } from "./conversation.events.js";
import { getContactRelations } from "../../clients/relationship-client.js";

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

async function findLatestVisibleMessage(
  conversation: ConversationDocument,
  userId: string,
): Promise<{
  message: MessageDocument;
  state: MessageUserStateEntity | null;
} | null> {
  const ownerId = new Types.ObjectId(userId);
  const states = await MessageUserStateModel.find({
    conversationId: conversation._id,
    userId: ownerId,
  })
    .select({ messageId: 1, hidden: 1, favorite: 1, pinned: 1 })
    .exec();
  const hiddenMessageIds = states
    .filter((state) => state.hidden)
    .map((state) => state.messageId);
  const favoriteMessageIds = states
    .filter((state) => state.favorite && !state.hidden)
    .map((state) => state.messageId);
  const clauses: Record<string, unknown>[] = [
    { conversationId: conversation._id },
    ...(hiddenMessageIds.length > 0
      ? [{ _id: { $nin: hiddenMessageIds } }]
      : []),
  ];
  const participantState = conversation.participants.find((participant) =>
    participant.userId.equals(ownerId),
  );
  if (
    participantState?.clearedAt !== null &&
    participantState?.clearedAt !== undefined
  ) {
    clauses.push({
      $or: [
        { createdAt: { $gt: participantState.clearedAt } },
        ...(favoriteMessageIds.length > 0
          ? [{ _id: { $in: favoriteMessageIds } }]
          : []),
      ],
    });
  }
  const message = await MessageModel.find({ $and: clauses })
    .sort({ createdAt: -1, _id: -1 })
    .limit(1)
    .exec()
    .then((items) => items[0] ?? null);
  if (message === null) return null;
  return {
    message,
    state: states.find((state) => state.messageId.equals(message._id)) ?? null,
  };
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
  const lastMessageIds = page.flatMap((conversation) =>
    conversation.lastMessageId === null ? [] : [conversation.lastMessageId],
  );
  const [users, messages, messageStates, contactRelations] = await Promise.all([
    UserModel.find({ _id: { $in: otherIds } }).exec(),
    MessageModel.find({
      _id: {
        $in: lastMessageIds,
      },
    }).exec(),
    MessageUserStateModel.find({
      userId: ownerId,
      messageId: { $in: lastMessageIds },
    }).exec(),
    getContactRelations(context.userId, otherIds.map((id) => id.toString())),
  ]);
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const messagesById = new Map(
    messages.map((message) => [message._id.toString(), message]),
  );
  const messageStatesById = new Map(
    messageStates.map((state) => [state.messageId.toString(), state]),
  );
  const fallbackByConversationId = new Map<
    string,
    { message: MessageDocument; state: MessageUserStateEntity | null } | null
  >();
  await Promise.all(
    page.map(async (conversation) => {
      const message =
        conversation.lastMessageId === null
          ? null
          : (messagesById.get(conversation.lastMessageId.toString()) ?? null);
      const state =
        message === null
          ? null
          : (messageStatesById.get(message._id.toString()) ?? null);
      const participantState = conversation.participants.find((participant) =>
        participant.userId.equals(ownerId),
      );
      const hiddenOrCleared =
        message === null
          ? conversation.lastMessageId !== null
          : state?.hidden === true ||
            (participantState?.clearedAt !== null &&
              participantState?.clearedAt !== undefined &&
              message.createdAt <= participantState.clearedAt &&
              state?.favorite !== true);
      if (!hiddenOrCleared) return;
      fallbackByConversationId.set(
        conversation._id.toString(),
        await findLatestVisibleMessage(conversation, context.userId),
      );
    }),
  );
  const result = page.flatMap((conversation) => {
    const participantId = getOtherParticipant(conversation, context.userId);
    const participant = usersById.get(participantId.toString());
    if (participant === undefined) {
      return [];
    }
    const currentMessage =
      conversation.lastMessageId === null
        ? null
        : (messagesById.get(conversation.lastMessageId.toString()) ?? null);
    const fallback = fallbackByConversationId.get(conversation._id.toString());
    const message = fallback?.message ?? currentMessage;
    const messageState =
      fallback?.state ??
      (message === null
        ? null
        : (messageStatesById.get(message._id.toString()) ?? null));
    return [
      toConversationDto(
        conversation,
        context.userId,
        participant,
        contactRelations.has(participantId.toString())
          ? { customName: contactRelations.get(participantId.toString()) ?? null }
          : null,
        message,
        messageState,
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
  keepFavorites = false,
): Promise<{
  conversation: ConversationDocument;
  clearedAt: Date;
  keptFavorites: boolean;
}> {
  const conversation = await getOwnedConversation(context, conversationId);
  const clearedAt = new Date();
  const updated = await ConversationModel.findOneAndUpdate(
    { _id: conversation._id },
    {
      $set: {
        "participants.$[participant].clearedAt": clearedAt,
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
  await MessageUserStateModel.updateMany(
    {
      conversationId: conversation._id,
      userId: currentUserId(context),
    },
    {
      $set: {
        pinned: false,
        ...(keepFavorites ? {} : { favorite: false }),
      },
    },
  ).exec();
  publishConversationCleared({
    conversationId: conversation._id.toString(),
    userId: context.userId,
    clearedAt: clearedAt.toISOString(),
    keptFavorites: keepFavorites,
  });
  return { conversation: updated, clearedAt, keptFavorites: keepFavorites };
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
