import { env } from "../config/env.js";
import type { AuthContext } from "../auth/socket-auth.js";
import { requestInternal } from "./http.js";

export interface CallSignal { id: string; type: "voice" | "video"; callerId: string; calleeId: string; status: string; initiatedAt: string; answeredAt: string | null; endedAt: string | null; }
export interface CallUser { id: string; username: string; displayName: string; avatarUrl: string | null; badges?: string[]; }
export interface CallActionResult { call: CallSignal; changed: boolean; }
export interface StartCallResult extends CallActionResult { caller: CallUser; }
export interface SignalingTarget { otherUserId: string; }

function action(context: AuthContext, token: string, path: string, body: Record<string, unknown>): Promise<CallActionResult> {
  return requestInternal<CallActionResult>(env.CALL_SERVICE_URL, path, { method: "POST", accessToken: token, body: { ...body, userId: context.userId, sessionId: context.sessionId } });
}

export function startCall(context: AuthContext, token: string, input: Record<string, unknown>): Promise<StartCallResult> {
  return requestInternal<StartCallResult>(env.CALL_SERVICE_URL, "/internal/realtime/calls/start", { method: "POST", accessToken: token, body: { ...input, userId: context.userId, sessionId: context.sessionId } });
}
export function acceptCall(context: AuthContext, token: string, callId: string): Promise<CallActionResult> { return action(context, token, "/internal/realtime/calls/accept", { callId }); }
export function declineCall(context: AuthContext, token: string, callId: string): Promise<CallActionResult> { return action(context, token, "/internal/realtime/calls/decline", { callId }); }
export function cancelCall(context: AuthContext, token: string, callId: string): Promise<CallActionResult> { return action(context, token, "/internal/realtime/calls/cancel", { callId }); }
export function endCall(context: AuthContext, token: string, callId: string): Promise<CallActionResult> { return action(context, token, "/internal/realtime/calls/end", { callId }); }
export function failCall(context: AuthContext, token: string, callId: string): Promise<CallActionResult> { return action(context, token, "/internal/realtime/calls/fail", { callId }); }
export function authorizeSignal(context: AuthContext, token: string, callId: string, kind: "offer" | "answer" | "ice"): Promise<SignalingTarget> { return requestInternal<SignalingTarget>(env.CALL_SERVICE_URL, "/internal/realtime/calls/authorize-signal", { method: "POST", accessToken: token, body: { callId, kind, userId: context.userId } }); }

export interface DisconnectedCallsResult { calls: Array<{ call: CallSignal; event: "call:cancelled" | "call:failed" }>; }
export function sessionDisconnected(sessionId: string): Promise<DisconnectedCallsResult> { return requestInternal<DisconnectedCallsResult>(env.CALL_SERVICE_URL, "/internal/realtime/calls/session-disconnected", { method: "POST", body: { sessionId } }); }
