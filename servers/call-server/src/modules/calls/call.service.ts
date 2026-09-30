import { Types } from "mongoose";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import { redisClient } from "../../lib/redis.js";
import { ConversationModel } from "../../models/conversation.model.js";
import { CallModel } from "../../models/call.model.js";
import type { CallDocument, CallDto, CallStatus } from "../../models/call.types.js";
import { UserModel } from "../../models/user.model.js";
import type { UserDocument } from "../../models/user.types.js";
import { decodeCursor, encodeCursor } from "../../utils/cursor.js";
import { directConversationKey } from "../conversations/conversation.service.js";
import { assertUsersCanInteract } from "../privacy/block.service.js";
import { getUserById } from "../users/user.service.js";
import { toCallDto, toCallSignalDto, toCallUserDto } from "./call.dto.js";
import { iceServers } from "./call.config.js";
import type { CallHistoryQuery, CallStartInput } from "./call.validation.js";

const activeCallStatuses: CallStatus[] = ["ringing", "accepted"];
const terminalCallStatuses: CallStatus[] = ["declined", "missed", "ended", "cancelled", "failed"];
const activeCallKeyPrefix = "terqivo:active-call:user:";
const callRateWindowSeconds = 15 * 60;

export interface AuthContext { userId: string; sessionId: string; }
export interface CallActionResult { call: CallDocument; changed: boolean; }
export interface SignalingTarget { call: CallDocument; otherUserId: string; }

const error = (code: string, message: string, statusCode: number): AppError => new AppError({ code, message, statusCode });
const callNotFound = (): AppError => error("CALL_NOT_FOUND", "The call was not found.", 404);
const invalidTransition = (): AppError => error("CALL_INVALID_STATE", "That call action is not valid in the current state.", 409);
const callBusy = (): AppError => error("CALL_BUSY", "One of the users is already in an active call.", 409);
const targetUnavailable = (): AppError => error("CALL_TARGET_UNAVAILABLE", "The call target is unavailable.", 404);
const callForbidden = (): AppError => error("CALL_FORBIDDEN", "You are not a participant in this call.", 403);
const signalingUnavailable = (): AppError => error("CALL_SIGNALING_UNAVAILABLE", "Signaling is only available for an active call.", 409);
const objectId = (value: string): Types.ObjectId => new Types.ObjectId(value);
const activeCallKey = (userId: string): string => `${activeCallKeyPrefix}${userId}`;

async function releaseActiveCallKey(userId: string, callId: string): Promise<void> {
  const key = activeCallKey(userId);
  if ((await redisClient.get(key)) === callId) await redisClient.del(key);
}

export async function releaseActiveCallKeys(call: CallDocument): Promise<void> {
  await Promise.all([releaseActiveCallKey(call.callerId.toString(), call._id.toString()), releaseActiveCallKey(call.calleeId.toString(), call._id.toString())]);
}

async function reserveActiveCallKey(userId: string, callId: string): Promise<boolean> {
  const key = activeCallKey(userId);
  const existingCallId = await redisClient.get(key);
  if (existingCallId !== null && existingCallId !== callId) {
    const existingCall = await CallModel.findById(existingCallId).select({ status: 1 }).exec();
    if (existingCall === null || terminalCallStatuses.includes(existingCall.status)) await redisClient.del(key);
  }
  return (await redisClient.set(key, callId, { NX: true, EX: env.CALL_ACTIVE_TTL_SECONDS })) === "OK";
}

function callParticipantsQuery(userIds: readonly string[]): Record<string, unknown> {
  const ids = userIds.map(objectId);
  return {
    $or: [
      { callerId: { $in: ids } },
      { calleeId: { $in: ids } },
    ],
  };
}

/**
 * Redis locks are deliberately short-lived safety locks, not the source of
 * truth. If a process or network dies before publishing a terminal transition,
 * the database can otherwise leave a user permanently busy. Reconcile only
 * calls that are older than the same lifecycle limits already used by the
 * timeout coordinator.
 */
async function reconcileStaleActiveCalls(userIds: readonly string[]): Promise<void> {
  const now = Date.now();
  const candidates = await CallModel.find({
    ...callParticipantsQuery(userIds),
    status: { $in: activeCallStatuses },
  }).select({ status: 1, initiatedAt: 1, answeredAt: 1, updatedAt: 1 }).exec();

  for (const candidate of candidates) {
    const lastActivity = candidate.status === "ringing" ? candidate.initiatedAt : candidate.updatedAt;
    const maxAge = candidate.status === "ringing"
      ? env.CALL_RING_TIMEOUT_SECONDS * 1000
      : env.CALL_ACTIVE_TTL_SECONDS * 1000;
    if (now - lastActivity.getTime() < maxAge) continue;

    const status = candidate.status === "ringing" ? "missed" : "failed";
    const endReason = candidate.status === "ringing" ? "timeout" : "connection-failed";
    const endedAt = new Date();
    const stale = await CallModel.findOneAndUpdate(
      { _id: candidate._id, status: candidate.status },
      {
        $set: {
          status,
          endedAt,
          durationSeconds: candidate.answeredAt === null ? 0 : Math.max(0, Math.floor((endedAt.getTime() - candidate.answeredAt.getTime()) / 1000)),
          endReason,
        },
      },
      { returnDocument: "after" },
    ).exec();
    if (stale !== null) await releaseActiveCallKeys(stale);
  }
}

async function enforceCallRateLimit(userId: string): Promise<void> {
  const window = Math.floor(Date.now() / (callRateWindowSeconds * 1000));
  const count = await redisClient.incr(`terqivo:call-rate:${userId}:${window}`);
  if (count === 1) await redisClient.expire(`terqivo:call-rate:${userId}:${window}`, callRateWindowSeconds);
  if (count > env.CALL_START_RATE_LIMIT_MAX) throw error("CALL_RATE_LIMITED", "Too many call attempts. Please try again later.", 429);
}

async function getOwnedCall(context: AuthContext, callId: string): Promise<CallDocument> {
  if (!Types.ObjectId.isValid(callId)) throw callNotFound();
  const call = await CallModel.findOne({ _id: objectId(callId), $or: [{ callerId: objectId(context.userId) }, { calleeId: objectId(context.userId) }] }).exec();
  if (call === null) throw callNotFound();
  return call;
}

function setEndedFields(call: CallDocument, endedAt: Date, endedBy: Types.ObjectId | null, reason: CallDocument["endReason"]): void {
  call.endedAt = endedAt;
  call.endedBy = endedBy;
  call.endReason = reason;
  call.durationSeconds = call.answeredAt === null ? 0 : Math.max(0, Math.floor((endedAt.getTime() - call.answeredAt.getTime()) / 1000));
}

async function saveTransition(call: CallDocument, expectedStatus: CallStatus, changes: Record<string, unknown>): Promise<CallActionResult> {
  if (call.status !== expectedStatus) throw invalidTransition();
  const saved = await CallModel.findOneAndUpdate({ _id: call._id, status: expectedStatus }, { $set: changes }, { returnDocument: "after" }).exec();
  if (saved === null) throw invalidTransition();
  return { call: saved, changed: true };
}

export async function startCall(context: AuthContext, input: CallStartInput): Promise<CallActionResult & { caller: UserDocument }> {
  if (context.userId === input.calleeId) throw error("CANNOT_CALL_SELF", "You cannot call yourself.", 400);
  await enforceCallRateLimit(context.userId);
  const [caller, callee] = await Promise.all([getUserById(context.userId), getUserById(input.calleeId)]);
  if (caller === null || caller.accountStatus !== "active" || callee === null || callee.accountStatus !== "active") throw targetUnavailable();
  await assertUsersCanInteract(context.userId, input.calleeId);
  await reconcileStaleActiveCalls([context.userId, input.calleeId]);
  const existing = await CallModel.findOne({ $or: [
    ...activeCallStatuses.map((status) => ({ callerId: objectId(context.userId), status })),
    ...activeCallStatuses.map((status) => ({ calleeId: objectId(context.userId), status })),
    ...activeCallStatuses.map((status) => ({ callerId: objectId(input.calleeId), status })),
    ...activeCallStatuses.map((status) => ({ calleeId: objectId(input.calleeId), status })),
  ] }).exec();
  if (existing !== null) throw callBusy();
  const callId = new Types.ObjectId();
  if (!await reserveActiveCallKey(context.userId, callId.toString())) throw callBusy();
  if (!await reserveActiveCallKey(input.calleeId, callId.toString())) {
    await releaseActiveCallKey(context.userId, callId.toString());
    throw callBusy();
  }
  try {
    const conversation = await ConversationModel.findOne({ directKey: directConversationKey(context.userId, input.calleeId) }).select({ _id: 1 }).exec();
    const now = new Date();
    const call = await CallModel.create({ _id: callId, callerId: objectId(context.userId), calleeId: objectId(input.calleeId), conversationId: conversation?._id ?? null, type: input.type, status: "ringing", initiatedAt: now, answeredAt: null, endedAt: null, durationSeconds: null, endedBy: null, endReason: null, callerSessionId: context.sessionId, acceptedBySessionId: null, callChatMessageCount: 0 });
    return { call, caller, changed: true };
  } catch (caught) {
    await Promise.all([releaseActiveCallKey(context.userId, callId.toString()), releaseActiveCallKey(input.calleeId, callId.toString())]);
    throw caught;
  }
}

export async function acceptCall(context: AuthContext, callId: string): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (call.calleeId.toString() !== context.userId) throw callForbidden();
  await assertUsersCanInteract(call.callerId.toString(), call.calleeId.toString());
  if (call.status === "accepted") return { call, changed: false };
  return saveTransition(call, "ringing", { status: "accepted", answeredAt: new Date(), acceptedBySessionId: context.sessionId });
}

export async function declineCall(context: AuthContext, callId: string): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (call.calleeId.toString() !== context.userId) throw callForbidden();
  if (terminalCallStatuses.includes(call.status)) {
    await releaseActiveCallKeys(call);
    return { call, changed: false };
  }
  const result = await saveTransition(call, "ringing", { status: "declined", endedAt: new Date(), endReason: "declined", durationSeconds: 0 });
  await releaseActiveCallKeys(result.call);
  return result;
}

export async function cancelCall(context: AuthContext, callId: string): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (call.callerId.toString() !== context.userId) throw callForbidden();
  if (terminalCallStatuses.includes(call.status)) {
    await releaseActiveCallKeys(call);
    return { call, changed: false };
  }
  const result = await saveTransition(call, "ringing", { status: "cancelled", endedAt: new Date(), endReason: "cancelled", durationSeconds: 0 });
  await releaseActiveCallKeys(result.call);
  return result;
}

export async function endCall(context: AuthContext, callId: string): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (terminalCallStatuses.includes(call.status)) {
    await releaseActiveCallKeys(call);
    return { call, changed: false };
  }
  if (call.status === "ringing") {
    const endedAt = new Date();
    const callerEnded = call.callerId.toString() === context.userId;
    const result = await saveTransition(call, "ringing", {
      status: callerEnded ? "cancelled" : "declined",
      endedAt,
      endedBy: objectId(context.userId),
      endReason: callerEnded ? "cancelled" : "declined",
      durationSeconds: 0,
    });
    await releaseActiveCallKeys(result.call);
    return result;
  }
  if (call.status !== "accepted") throw invalidTransition();
  const endedAt = new Date();
  setEndedFields(call, endedAt, objectId(context.userId), "local-ended");
  const result = await saveTransition(call, "accepted", { status: "ended", endedAt, endedBy: objectId(context.userId), endReason: "local-ended", durationSeconds: call.durationSeconds });
  await releaseActiveCallKeys(result.call);
  return result;
}

export async function failCall(context: AuthContext, callId: string): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (terminalCallStatuses.includes(call.status)) {
    await releaseActiveCallKeys(call);
    return { call, changed: false };
  }
  if (call.status !== "accepted") throw invalidTransition();
  const endedAt = new Date();
  setEndedFields(call, endedAt, objectId(context.userId), "connection-failed");
  const result = await saveTransition(call, "accepted", { status: "failed", endedAt, endedBy: objectId(context.userId), endReason: "connection-failed", durationSeconds: call.durationSeconds });
  await releaseActiveCallKeys(result.call);
  return result;
}

export async function changeCallType(context: AuthContext, callId: string, type: CallDocument["type"]): Promise<CallActionResult> {
  const call = await getOwnedCall(context, callId);
  if (call.status !== "accepted") throw signalingUnavailable();
  if (call.type === type) return { call, changed: false };
  await assertUsersCanInteract(call.callerId.toString(), call.calleeId.toString());
  const updated = await CallModel.findOneAndUpdate(
    { _id: call._id, status: "accepted" },
    { $set: { type } },
    { returnDocument: "after" },
  ).exec();
  if (updated === null) throw invalidTransition();
  return { call: updated, changed: true };
}

export async function markCallMissed(callId: string): Promise<CallDocument | null> {
  if (!Types.ObjectId.isValid(callId)) return null;
  const call = await CallModel.findOneAndUpdate({ _id: objectId(callId), status: "ringing" }, { $set: { status: "missed", endedAt: new Date(), durationSeconds: 0, endReason: "timeout" } }, { returnDocument: "after" }).exec();
  if (call !== null) await releaseActiveCallKeys(call);
  return call;
}

export async function cancelCallsForSession(sessionId: string): Promise<CallDocument[]> {
  const affected: CallDocument[] = [];
  const ringing = await CallModel.find({ status: "ringing", callerSessionId: sessionId }).exec();
  for (const call of ringing) {
    const updated = await CallModel.findOneAndUpdate({ _id: call._id, status: "ringing", callerSessionId: sessionId }, { $set: { status: "cancelled", endedAt: new Date(), durationSeconds: 0, endReason: "cancelled" } }, { returnDocument: "after" }).exec();
    if (updated !== null) { await releaseActiveCallKeys(updated); affected.push(updated); }
  }
  const accepted = await CallModel.find({ status: "accepted", $or: [{ callerSessionId: sessionId }, { acceptedBySessionId: sessionId }] }).exec();
  for (const call of accepted) {
    const endedAt = new Date();
    const updated = await CallModel.findOneAndUpdate({ _id: call._id, status: "accepted", $or: [{ callerSessionId: sessionId }, { acceptedBySessionId: sessionId }] }, { $set: { status: "failed", endedAt, endedBy: call.callerSessionId === sessionId ? call.callerId : call.calleeId, durationSeconds: call.answeredAt === null ? 0 : Math.max(0, Math.floor((endedAt.getTime() - call.answeredAt.getTime()) / 1000)), endReason: "connection-failed" } }, { returnDocument: "after" }).exec();
    if (updated !== null) { await releaseActiveCallKeys(updated); affected.push(updated); }
  }
  return affected;
}

export async function assertSignalingAllowed(context: AuthContext, callId: string): Promise<SignalingTarget> {
  const call = await getOwnedCall(context, callId);
  if (call.status !== "accepted") throw signalingUnavailable();
  await assertUsersCanInteract(call.callerId.toString(), call.calleeId.toString());
  return { call, otherUserId: call.callerId.toString() === context.userId ? call.calleeId.toString() : call.callerId.toString() };
}

export const callSignal = toCallSignalDto;

export async function listCallHistory(context: AuthContext, query: CallHistoryQuery): Promise<{ calls: CallDto[]; nextCursor: string | null }> {
  const userId = objectId(context.userId);
  const filter: Record<string, unknown> = { $or: [{ callerId: userId }, { calleeId: userId }] };
  const cursor = decodeCursor(query.cursor);
  if (cursor !== null) {
    const initiatedAt = new Date(cursor.createdAt);
    if (Number.isNaN(initiatedAt.getTime()) || !Types.ObjectId.isValid(cursor.id)) throw error("INVALID_CURSOR", "The pagination cursor is invalid.", 400);
    filter.$and = [{ $or: [{ initiatedAt: { $lt: initiatedAt } }, { initiatedAt, _id: { $lt: objectId(cursor.id) } }] }];
  }
  const records = await CallModel.find(filter).sort({ initiatedAt: -1, _id: -1 }).limit(query.limit + 1).exec();
  const hasNext = records.length > query.limit;
  const page = hasNext ? records.slice(0, query.limit) : records;
  const otherIds = page.map((call) => call.callerId.equals(userId) ? call.calleeId : call.callerId);
  const users = await UserModel.find({ _id: { $in: otherIds } }).exec();
  const byId = new Map(users.map((user) => [user._id.toString(), user]));
  const calls = page.flatMap((call) => { const otherId = call.callerId.equals(userId) ? call.calleeId : call.callerId; const other = byId.get(otherId.toString()); return other === undefined ? [] : [toCallDto(call, context.userId, other)]; });
  const last = page.at(-1);
  return { calls, nextCursor: hasNext && last !== undefined ? encodeCursor({ createdAt: last.initiatedAt.toISOString(), id: last._id.toString() }) : null };
}

export async function getCallDetails(context: AuthContext, callId: string): Promise<CallDto> {
  const call = await getOwnedCall(context, callId);
  const otherId = call.callerId.toString() === context.userId ? call.calleeId.toString() : call.callerId.toString();
  const user = await getUserById(otherId);
  if (user === null) throw callNotFound();
  return toCallDto(call, context.userId, user);
}

export async function recordCallChatActivity(context: AuthContext, callId: string): Promise<number> {
  const call = await CallModel.findOne({
    _id: objectId(callId),
    status: "accepted",
    $or: [{ callerId: objectId(context.userId) }, { calleeId: objectId(context.userId) }],
  }).exec();
  if (call === null) throw error("CALL_NOT_ACTIVE", "The call is no longer active.", 409);
  call.callChatMessageCount = (call.callChatMessageCount ?? 0) + 1;
  await call.save();
  return call.callChatMessageCount;
}

export async function initializeCallModels(): Promise<void> {
  if (iceServers.length === 0) throw new Error("At least one ICE server must be configured.");
  await CallModel.init();
}

export { toCallUserDto };
