import type {
  PresenceSessionDto,
  UserPresenceResponse,
} from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { isUserOnline } from "../../lib/presence.js";
import { decodeCursor, encodeCursor } from "../../utils/cursors.js";
import { isMongoDuplicateKeyError } from "../../utils/mongo.js";
import { AuthSessionModel } from "../auth/auth-session.model.js";
import type { AuthContext } from "../auth/auth.types.js";
import { UserModel } from "./user.model.js";
import { UserPresenceSessionModel } from "./user-presence-session.model.js";
import type { UserPresenceSessionDocument } from "./user-presence-session.types.js";
import type { PresenceHistoryQuery } from "./presence.validation.js";

function presenceNotFound(): AppError {
  return new AppError({
    code: "PRESENCE_NOT_FOUND",
    message: "The requested presence history was not found.",
    statusCode: 404,
  });
}

function presenceObjectId(userId: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(userId)) {
    throw presenceNotFound();
  }
  return new Types.ObjectId(userId);
}

function durationSeconds(startedAt: Date, endedAt: Date): number {
  return Math.max(
    0,
    Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
  );
}

function toPresenceSessionDto(
  session: UserPresenceSessionDocument,
  now = new Date(),
): PresenceSessionDto {
  const endedAt = session.endedAt;
  return {
    id: session._id.toString(),
    startedAt: session.startedAt.toISOString(),
    endedAt: endedAt?.toISOString() ?? null,
    durationSeconds:
      endedAt === null
        ? durationSeconds(session.startedAt, now)
        : session.durationSeconds,
  };
}

async function updateLastSeenAt(
  userId: Types.ObjectId,
  lastSeenAt: Date,
): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $set: { lastSeenAt } }).exec();
}

async function closeActivePresenceSession(
  userId: Types.ObjectId,
  endedAt: Date,
  startedBefore?: Date,
): Promise<UserPresenceSessionDocument | null> {
  const activeFilter: {
    userId: Types.ObjectId;
    endedAt: null;
    startedAt?: { $lt: Date };
  } = {
    userId,
    endedAt: null,
  };
  if (startedBefore !== undefined) {
    activeFilter.startedAt = { $lt: startedBefore };
  }

  const active = await UserPresenceSessionModel.findOne(activeFilter)
    .sort({ startedAt: -1 })
    .exec();

  if (active === null) {
    return null;
  }

  return UserPresenceSessionModel.findOneAndUpdate(
    {
      _id: active._id,
      endedAt: null,
    },
    {
      $set: {
        endedAt,
        durationSeconds: durationSeconds(active.startedAt, endedAt),
      },
    },
    { returnDocument: "after" },
  ).exec();
}

export async function startUserPresenceSession(
  userId: string,
  authSessionId: string,
): Promise<UserPresenceSessionDocument> {
  const objectId = presenceObjectId(userId);
  const now = new Date();
  const recoveredSession = await closeActivePresenceSession(objectId, now);
  if (recoveredSession !== null) {
    await updateLastSeenAt(objectId, now);
  }

  const authSession = await AuthSessionModel.findOne({
    userId: objectId,
    sessionId: authSessionId,
  })
    .select({ deviceId: 1, platform: 1 })
    .exec();

  try {
    return await UserPresenceSessionModel.create({
      userId: objectId,
      startedAt: now,
      endedAt: null,
      durationSeconds: 0,
      deviceId: authSession?.deviceId ?? null,
      platform: authSession?.platform ?? null,
    });
  } catch (error: unknown) {
    if (!isMongoDuplicateKeyError(error)) {
      throw error;
    }

    const active = await UserPresenceSessionModel.findOne({
      userId: objectId,
      endedAt: null,
    }).exec();
    if (active === null) {
      throw error;
    }
    return active;
  }
}

export async function endUserPresenceSession(
  userId: string,
  endedAt = new Date(),
): Promise<{
  record: UserPresenceSessionDocument | null;
  lastSeenAt: Date;
}> {
  const objectId = presenceObjectId(userId);
  if (await isUserOnline(userId)) {
    return { record: null, lastSeenAt: endedAt };
  }

  const record = await closeActivePresenceSession(objectId, endedAt, endedAt);
  await updateLastSeenAt(objectId, endedAt);
  return { record, lastSeenAt: endedAt };
}

async function reconcileStalePresence(
  userId: Types.ObjectId,
): Promise<Date | null> {
  const checkedAt = new Date();
  if (await isUserOnline(userId.toString())) {
    return null;
  }

  const closed = await closeActivePresenceSession(userId, checkedAt, checkedAt);
  if (closed !== null) {
    const lastSeenAt = closed.endedAt ?? new Date();
    await updateLastSeenAt(userId, lastSeenAt);
    return lastSeenAt;
  }
  return null;
}

export async function getOwnPresenceHistory(
  context: AuthContext,
  requestedUserId: string,
  query: PresenceHistoryQuery,
): Promise<UserPresenceResponse> {
  if (context.userId !== requestedUserId) {
    throw presenceNotFound();
  }

  const userId = presenceObjectId(requestedUserId);
  const user = await UserModel.findById(userId)
    .select({ lastSeenAt: 1 })
    .exec();
  if (user === null) {
    throw presenceNotFound();
  }

  const reconciledLastSeenAt = await reconcileStalePresence(userId);
  const isOnline = await isUserOnline(requestedUserId);
  const cursor = decodeCursor(query.cursor);
  const presenceFilter: {
    userId: Types.ObjectId;
    $or?: Array<
      | { startedAt: { $lt: Date } }
      | { startedAt: Date; _id: { $lt: Types.ObjectId } }
    >;
  } = { userId };

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
    const cursorId = new Types.ObjectId(cursor.id);
    presenceFilter.$or = [
      { startedAt: { $lt: cursorDate } },
      { startedAt: cursorDate, _id: { $lt: cursorId } },
    ];
  }

  const records = await UserPresenceSessionModel.find(presenceFilter)
    .sort({ startedAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .exec();
  const hasMore = records.length > query.limit;
  const page = hasMore ? records.slice(0, query.limit) : records;
  const lastRecord = page.at(-1);

  return {
    isOnline,
    lastSeenAt:
      reconciledLastSeenAt?.toISOString() ??
      user.lastSeenAt?.toISOString() ??
      null,
    sessions: page.map((record) => toPresenceSessionDto(record)),
    nextCursor:
      hasMore && lastRecord !== undefined
        ? encodeCursor({
            createdAt: lastRecord.startedAt.toISOString(),
            id: lastRecord._id.toString(),
          })
        : null,
  };
}

export async function initializePresenceModels(): Promise<void> {
  await UserPresenceSessionModel.init();
}
