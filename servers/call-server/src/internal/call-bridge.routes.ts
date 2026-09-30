import { Router } from "express";
import { z } from "zod";

import { AppError } from "../core/errors.js";
import { requireRealtimeHubService } from "./service-auth.js";
import { authenticate, requireAuthContext } from "../middleware/authenticate.js";
import { callIdParamsSchema, callMediaTypeSchema, callStartSchema } from "../modules/calls/call.validation.js";
import { acceptCall, assertSignalingAllowed, callSignal, cancelCall, cancelCallsForSession, changeCallType, declineCall, endCall, failCall, recordCallChatActivity, startCall } from "../modules/calls/call.service.js";
import { toCallUserDto } from "../modules/calls/call.dto.js";
import { clearCallTimeout, scheduleCallTimeout } from "../realtime/timeout.js";
import { callEvent, publishCallEvent } from "../realtime/events.js";
import { notifyIncomingCall } from "../realtime/push.js";

const signalSchema = z.object({ callId: z.string().trim().min(1), kind: z.enum(["offer", "answer", "ice", "chat"]) });
const sessionSchema = z.object({ sessionId: z.string().trim().min(1).max(256) });

function actionEvent(event: "call:declined" | "call:cancelled" | "call:ended" | "call:failed", call: Parameters<typeof callEvent>[0]) {
  return { ...callEvent(call, event), targetUserIds: [call.callerId.toString(), call.calleeId.toString()] };
}

function terminalEventForCall(call: Parameters<typeof callEvent>[0], fallback: "call:declined" | "call:cancelled" | "call:ended" | "call:failed") {
  if (call.status === "declined") return actionEvent("call:declined", call);
  if (call.status === "cancelled") return actionEvent("call:cancelled", call);
  if (call.status === "failed") return actionEvent("call:failed", call);
  if (call.status === "ended") return actionEvent("call:ended", call);
  return actionEvent(fallback, call);
}

export function createCallBridgeRouter(): Router {
  const router = Router();
  router.use(async (request, _response, next) => {
    try { await requireRealtimeHubService(request.get("x-internal-service-token")); next(); }
    catch { next(new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 401 })); }
  });

  router.post("/calls/start", authenticate, async (request, response, next) => {
    try {
      const result = await startCall(requireAuthContext(request), callStartSchema.parse(request.body));
      await scheduleCallTimeout(result.call._id.toString(), result.call.initiatedAt);
      await publishCallEvent({ ...callEvent(result.call, "call:ringing"), targetUserIds: [result.call.callerId.toString()] });
      await publishCallEvent({ ...callEvent(result.call, "call:incoming"), targetUserIds: [result.call.calleeId.toString()], caller: toCallUserDto(result.caller) });
      void notifyIncomingCall(result.call);
      response.status(201).json({ success: true, data: { call: callSignal(result.call), caller: toCallUserDto(result.caller), changed: result.changed } });
    } catch (error) { next(error); }
  });

  const actions = [
    ["accept", acceptCall, "call:accepted"],
    ["decline", declineCall, "call:declined"],
    ["cancel", cancelCall, "call:cancelled"],
    ["end", endCall, "call:ended"],
    ["fail", failCall, "call:failed"],
  ] as const;
  for (const [name, operation, event] of actions) {
    router.post(`/calls/${name}`, authenticate, async (request, response, next) => {
      try {
        const { callId } = callIdParamsSchema.parse(request.body);
        const result = await operation(requireAuthContext(request), callId);
        if (result.changed || (event !== "call:accepted" && ["declined", "cancelled", "ended", "failed", "missed"].includes(result.call.status))) {
          await clearCallTimeout(result.call._id.toString());
          if (event === "call:accepted") {
            await publishCallEvent({ ...callEvent(result.call, event), targetUserIds: [result.call.callerId.toString()] });
            if (result.call.acceptedBySessionId !== null) {
              await publishCallEvent({ ...callEvent(result.call, event), targetSessionId: result.call.acceptedBySessionId });
            }
            await publishCallEvent({ ...callEvent(result.call, "call:answered-elsewhere"), targetUserIds: [result.call.calleeId.toString()], excludeSessionId: result.call.acceptedBySessionId ?? undefined });
          } else {
            await publishCallEvent(terminalEventForCall(result.call, event));
          }
        }
        response.status(200).json({ success: true, data: { call: callSignal(result.call), changed: result.changed } });
      } catch (error) { next(error); }
    });
  }

  router.post("/calls/media-type", authenticate, async (request, response, next) => {
    try {
      const input = callMediaTypeSchema.parse(request.body);
      const result = await changeCallType(requireAuthContext(request), input.callId, input.type);
      if (result.changed) {
        await publishCallEvent({ ...callEvent(result.call, "call:media-type"), targetUserIds: [result.call.callerId.toString(), result.call.calleeId.toString()] });
      }
      response.status(200).json({ success: true, data: { call: callSignal(result.call), changed: result.changed } });
    } catch (error) { next(error); }
  });

  router.post("/calls/chat-activity", authenticate, async (request, response, next) => {
    try {
      const { callId } = callIdParamsSchema.parse(request.body);
      const count = await recordCallChatActivity(requireAuthContext(request), callId);
      response.status(200).json({ success: true, data: { count } });
    } catch (error) { next(error); }
  });

  router.post("/calls/authorize-signal", authenticate, async (request, response, next) => {
    try {
      const input = signalSchema.parse(request.body);
      const context = requireAuthContext(request);
      const target = await assertSignalingAllowed(context, input.callId);
      response.status(200).json({ success: true, data: { otherUserId: target.otherUserId } });
    } catch (error) { next(error); }
  });

  router.post("/calls/session-disconnected", async (request, response, next) => {
    try {
      const { sessionId } = sessionSchema.parse(request.body);
      const calls = await cancelCallsForSession(sessionId);
      await Promise.all(calls.map(async (call) => {
        await clearCallTimeout(call._id.toString());
        await publishCallEvent(actionEvent(call.status === "cancelled" ? "call:cancelled" : "call:failed", call));
      }));
      response.status(200).json({ success: true, data: { calls: calls.map((call) => ({ call: callSignal(call), event: call.status === "cancelled" ? "call:cancelled" : "call:failed" })) } });
    } catch (error) { next(error); }
  });
  return router;
}
