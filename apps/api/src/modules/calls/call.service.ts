import type { CallEndReason, CallDto, CallStatus } from "@terqivo/contracts";
import { Types } from "mongoose";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import { redisClient } from "../../lib/redis.js";
import { decodeCursor, encodeCursor } from "../../utils/cursors.js";
import { directConversationKey } from "../conversations/conversation.service.js";
import { ConversationModel } from "../conversations/conversation.model.js";
import { UserModel } from "../users/user.model.js";
import { getUserById } from "../users/user.service.js";
import type { AuthContext } from "../auth/auth.types.js";
import type { UserDocument } from "../users/user.types.js";
import { CallModel } from "./call.model.js";
import { iceServers } from "./call.config.js";
import { toCallDto, toCallSignalDto } from "./call.dto.js";
import type { CallDocument } from "./call.types.js";
import type { CallHistoryQuery, CallStartInput } from "./call.validation.js";

const activeCallStatuses: CallStatus[] = ["ringing", "accepted"];
const terminalCallStatuses: CallStatus[] = [
  "declined",
  "missed",
  "ended",
  "cancelled",
  "failed",
];
const activeCallKeyPrefix = "terqivo:active-call:user:";
const callRateWindowSeconds = 15 * 60;

export interface CallActionResult {
  call: CallDocument;
  changed: boolean;
}

export interface SignalingTarget {
  call: CallDocument;
  otherUserId: string;
}

function callNotFound(): AppError {
  return new AppError({
    code: "CALL_NOT_FOUND",
    message: "The call was not found.",
    statusCode: 404,
  });
}

function invalidTransition(): AppError {
  return new AppError({
    code: "CALL_INVALID_STATE",
    message: "That call action is not valid in the current state.",
    statusCode: 409,
  });
}

function callBusy(): AppError {
  return new AppError({
    code: "CALL_BUSY",
    message: "One of the users is already in an active call.",
    statusCode: 409,
  });
}

function targetUnavailable(): AppError {
  return new AppError({
    code: "CALL_TARGET_UNAVAILABLE",
    message: "The call target is unavailable.",
    statusCode: 404,
  });
}

function callForbidden(): AppError {
  return new AppError({
    code: "CALL_FORBIDDEN",
    message: "You are not a participant in this call.",
    statusCode: 403,
  });
}

function signalingUnavailable(): AppError {
  return new AppError({
    code: "CALL_SIGNALING_UNAVAILABLE",
    message: "Signaling is only available for an active call.",
    statusCode: 409,
  });
}

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function activeCallKey(userId: string): string {
  return `${activeCallKeyPrefix}${userId}`;
}

async function releaseActiveCallKey(
  userId: string,
  callId: string,
): Promise<void> {
  const key = activeCallKey(userId);
  if ((await redisClient.get(key)) === callId) {
    await redisClient.del(key);
  }
}

export async function releaseActiveCallKeys(call: CallDocument): Promise<void> {
  await Promise.all([
    releaseActiveCallKey(call.callerId.toString(), call._id.toString()),
    releaseActiveCallKey(call.calleeId.toString(), call._id.toString()),
  ]);
}

async function reserveActiveCallKey(
  userId: string,
  callId: string,
): Promise<boolean> {
  const key = activeCallKey(userId);
  const existingCallId = await redisClient.get(key);
  if (existingCallId !== null && existingCallId !== callId) {
    const existingCall = await CallModel.findById(existingCallId)
      .select({ status: 1 })
      .exec();
    if (
      existingCall === null ||
      terminalCallStatuses.includes(existingCall.status)
    ) {
      await redisClient.del(key);
    }
  }
  const result = await redisClient.set(key, callId, {
    NX: true,
    EX: env.CALL_ACTIVE_TTL_SECONDS,
  });
  return result === "OK";
}

async function enforceCallRateLimit(userId: string): Promise<void> {
  const window = Math.floor(Date.now() / (callRateWindowSeconds * 1000));
  const key = `terqivo:call-rate:${userId}:${window}`;
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, callRateWindowSeconds);
  }
  if (count > env.CALL_START_RATE_LIMIT_MAX) {
    throw new AppError({
      code: "CALL_RATE_LIMITED",
      message: "Too many call attempts. Please try again later.",
      statusCode: 429,
    });
  }
}

async function getOwnedCall(
  context: AuthContext,
  callId: string,
): Promise<CallDocument> {
  if (!Types.ObjectId.isValid(callId)) {
    throw callNotFound();
  }
  const call = await CallModel.findOne({
    _id: objectId(callId),
    $or: [
      { callerId: objectId(context.userId) },
      { calleeId: objectId(context.userId) },
    ],
  }).exec();
  if (call === null) {
    throw callNotFound();
  }
  return call;
}

function setEndedFields(
  call: CallDocument,
  endedAt: Date,
  endedBy: Types.ObjectId | null,
  reason: CallEndReason,
): void {
  call.endedAt = endedAt;
  call.endedBy = endedBy;
  call.endReason = reason;
  call.durationSeconds =
    call.answeredAt === null
      ? 0
      : Math.max(
          0,
          Math.floor((endedAt.getTime() - call.answeredAt.getTime()) / 1000),
        );
}

async function saveTransition(
  call: CallDocument,
  expectedStatus: CallStatus,
  changes: Record<string, unknown>,
): Promise<CallActionResult> {
  if (call.status !== expectedStatus) {
    throw invalidTransition();
  }
  const saved = await CallModel.findOneAndUpdate(
    { _id: call._id, status: expectedStatus },
    { $set: changes },
    { returnDocument: "after" },
  ).exec();
  if (saved === null) {
    throw invalidTransition();
  }
  return { call: saved, changed: true };
}

export async function startCall(
  context: AuthContext,
  input: CallStartInput,
): Promise<CallActionResult & { caller: UserDocument }> {
  if (context.userId === input.calleeId) {
    throw new AppError({
      code: "CANNOT_CALL_SELF",
      message: "You cannot call yourself.",
      statusCode: 400,
    });
  }
  await enforceCallRateLimit(context.userId);
  const [caller, callee] = await Promise.all([
    getUserById(context.userId),
    getUserById(input.calleeId),
  ]);
  if (caller === null || caller.accountStatus !== "active") {
    throw targetUnavailable();
  }
  if (callee === null || callee.accountStatus !== "active") {
    throw targetUnavailable();
  }

  const existing = await CallModel.findOne({
    $or: [
      ...activeCallStatuses.map((status) => ({
        callerId: objectId(context.userId),
        status,
      })),
      ...activeCallStatuses.map((status) => ({
        calleeId: objectId(context.userId),
        status,
      })),
      ...activeCallStatuses.map((status) => ({
        callerId: objectId(input.calleeId),
        status,
      })),
      ...activeCallStatuses.map((status) => ({
        calleeId: objectId(input.calleeId),
        status,
      })),
    ],
  }).exec();
  if (existing !== null) {
    throw callBusy();
  }

  const callId = new Types.ObjectId();
  const callerSlot = await reserveActiveCallKey(
    context.userId,
    callId.toString(),
  );
  if (!callerSlot) {
    throw callBusy();
  }
  const calleeSlot = await reserveActiveCallKey(
    input.calleeId,
    callId.toString(),
  );
  if (!calleeSlot) {
    await releaseActiveCallKey(context.userId, callId.toString());
    throw callBusy();
  }

  try {
    const conversation = await ConversationModel.findOne({
      directKey: directConversationKey(context.userId, input.calleeId),
    })
      .select({ _id: 1 })
      .exec();
    const now = new Date();
    const call = await CallModel.create({
      _id: callId,
      callerId: objectId(context.userId),
      calleeId: objectId(input.calleeId),
      conversationId: conversation?._id ?? null,
      type: input.type,
      status: "ringing",
      initiatedAt: now,
      answeredAt: null,
      endedAt: null,
      durationSeconds: null,
      endedBy: null,
      endReason: null,
      callerSessionId: context.sessionId,
      acceptedBySessionId: null,
    });
    return { call, caller, changed: true };
  } catch (error) {
    await Promise.all([
      releaseActiveCallKey(context.userId, callId.toString()),
      releaseActiveCallKey(input.calleeId, callId.toString()),
    ]);
    throw error;
  }
}

export async function acceptCall(
  context: AuthContext,
  callId: string,
): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (call.calleeId.toString() !== context.userId) {
    throw callForbidden();
  }
  if (call.status === "accepted") {
    return { call, changed: false };
  }
  const result = await saveTransition(call, "ringing", {
    status: "accepted",
    answeredAt: new Date(),
    acceptedBySessionId: context.sessionId,
  });
  return result;
}

export async function declineCall(
  context: AuthContext,
  callId: string,
): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (call.calleeId.toString() !== context.userId) {
    throw callForbidden();
  }
  if (call.status === "declined") {
    return { call, changed: false };
  }
  const result = await saveTransition(call, "ringing", {
    status: "declined",
    endedAt: new Date(),
    endReason: "declined",
    durationSeconds: 0,
  });
  await releaseActiveCallKeys(result.call);
  return result;
}

export async function cancelCall(
  context: AuthContext,
  callId: string,
): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (call.callerId.toString() !== context.userId) {
    throw callForbidden();
  }
  if (call.status === "cancelled") {
    return { call, changed: false };
  }
  const result = await saveTransition(call, "ringing", {
    status: "cancelled",
    endedAt: new Date(),
    endReason: "cancelled",
    durationSeconds: 0,
  });
  await releaseActiveCallKeys(result.call);
  return result;
}

export async function endCall(
  context: AuthContext,
  callId: string,
): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (
    call.status === "ended" ||
    call.status === "failed" ||
    call.status === "declined" ||
    call.status === "cancelled" ||
    call.status === "missed"
  ) {
    return { call, changed: false };
  }
  if (call.status !== "accepted") {
    throw invalidTransition();
  }
  const endedAt = new Date();
  setEndedFields(call, endedAt, objectId(context.userId), "local-ended");
  const result = await saveTransition(call, "accepted", {
    status: "ended",
    endedAt,
    endedBy: objectId(context.userId),
    endReason: "local-ended",
    durationSeconds: call.durationSeconds,
  });
  await releaseActiveCallKeys(result.call);
  return result;
}

export async function failCall(
  context: AuthContext,
  callId: string,
): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (call.status === "failed") {
    return { call, changed: false };
  }
  if (call.status !== "accepted") {
    throw invalidTransition();
  }
  const endedAt = new Date();
  setEndedFields(call, endedAt, objectId(context.userId), "connection-failed");
  const result = await saveTransition(call, "accepted", {
    status: "failed",
    endedAt,
    endedBy: objectId(context.userId),
    endReason: "connection-failed",
    durationSeconds: call.durationSeconds,
  });
  await releaseActiveCallKeys(result.call);
  return result;
}

export async function markCallMissed(
  callId: string,
): Promise<CallDocument | null> {
  if (!Types.ObjectId.isValid(callId)) {
    return null;
  }
  const call = await CallModel.findOneAndUpdate(
    { _id: objectId(callId), status: "ringing" },
    {
      $set: {
        status: "missed",
        endedAt: new Date(),
        durationSeconds: 0,
        endReason: "timeout",
      },
    },
    { returnDocument: "after" },
  ).exec();
  if (call !== null) {
    await releaseActiveCallKeys(call);
  }
  return call;
}

export async function cancelCallsForSession(
  sessionId: string,
): Promise<CallDocument[]> {
  const ringing = await CallModel.find({
    status: "ringing",
    callerSessionId: sessionId,
  }).exec();
  const accepted = await CallModel.find({
    status: "accepted",
    $or: [{ callerSessionId: sessionId }, { acceptedBySessionId: sessionId }],
  }).exec();
  const affected: CallDocument[] = [];
  for (const call of ringing) {
    const updated = await CallModel.findOneAndUpdate(
      { _id: call._id, status: "ringing", callerSessionId: sessionId },
      {
        $set: {
          status: "cancelled",
          endedAt: new Date(),
          durationSeconds: 0,
          endReason: "cancelled",
        },
      },
      { returnDocument: "after" },
    ).exec();
    if (updated !== null) {
      await releaseActiveCallKeys(updated);
      affected.push(updated);
    }
  }
  for (const call of accepted) {
    const updated = await CallModel.findOneAndUpdate(
      {
        _id: call._id,
        status: "accepted",
        $or: [
          { callerSessionId: sessionId },
          { acceptedBySessionId: sessionId },
        ],
      },
      {
        $set: {
          status: "failed",
          endedAt: new Date(),
          endedBy:
            call.callerSessionId === sessionId ? call.callerId : call.calleeId,
          durationSeconds:
            call.answeredAt === null
              ? 0
              : Math.max(
                  0,
                  Math.floor((Date.now() - call.answeredAt.getTime()) / 1000),
                ),
          endReason: "connection-failed",
        },
      },
      { returnDocument: "after" },
    ).exec();
    if (updated !== null) {
      await releaseActiveCallKeys(updated);
      affected.push(updated);
    }
  }
  return affected;
}

export async function assertSignalingAllowed(
  context: AuthContext,
  callId: string,
): Promise<SignalingTarget> {
  const call = await getOwnedCall(context, callId);
  if (call.status !== "accepted") {
    throw signalingUnavailable();
  }
  const otherUserId =
    call.callerId.toString() === context.userId
      ? call.calleeId.toString()
      : call.callerId.toString();
  return { call, otherUserId };
}

export function callSignal(call: CallDocument) {
  return toCallSignalDto(call);
}

export async function listCallHistory(
  context: AuthContext,
  query: CallHistoryQuery,
): Promise<{ calls: CallDto[]; nextCursor: string | null }> {
  const userId = objectId(context.userId);
  const filter: Record<string, unknown> = {
    $or: [{ callerId: userId }, { calleeId: userId }],
  };
  const cursor = decodeCursor(query.cursor);
  if (cursor !== null) {
    const initiatedAt = new Date(cursor.createdAt);
    if (
      Number.isNaN(initiatedAt.getTime()) ||
      !Types.ObjectId.isValid(cursor.id)
    ) {
      throw new AppError({
        code: "INVALID_CURSOR",
        message: "The pagination cursor is invalid.",
        statusCode: 400,
      });
    }
    filter.$and = [
      {
        $or: [
          { initiatedAt: { $lt: initiatedAt } },
          { initiatedAt, _id: { $lt: objectId(cursor.id) } },
        ],
      },
    ];
  }
  const records = await CallModel.find(filter)
    .sort({ initiatedAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .exec();
  const hasNext = records.length > query.limit;
  const page = hasNext ? records.slice(0, query.limit) : records;
  const otherIds = page.map((call) =>
    call.callerId.equals(userId) ? call.calleeId : call.callerId,
  );
  const users = await UserModel.find({ _id: { $in: otherIds } }).exec();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const calls = page.flatMap((call) => {
    const otherId = call.callerId.equals(userId)
      ? call.calleeId
      : call.callerId;
    const otherUser = usersById.get(otherId.toString());
    return otherUser === undefined
      ? []
      : [toCallDto(call, context.userId, otherUser)];
  });
  const last = page.at(-1);
  return {
    calls,
    nextCursor:
      hasNext && last !== undefined
        ? encodeCursor({
            createdAt: last.initiatedAt.toISOString(),
            id: last._id.toString(),
          })
        : null,
  };
}

export async function getCallDetails(
  context: AuthContext,
  callId: string,
): Promise<CallDto> {
  const call = await getOwnedCall(context, callId);
  const otherId =
    call.callerId.toString() === context.userId
      ? call.calleeId.toString()
      : call.callerId.toString();
  const otherUser = await getUserById(otherId);
  if (otherUser === null) {
    throw callNotFound();
  }
  return toCallDto(call, context.userId, otherUser);
}

export async function initializeCallModels(): Promise<void> {
  if (iceServers.length === 0) {
    throw new Error("At least one ICE server must be configured.");
  }
  await CallModel.init();
}
