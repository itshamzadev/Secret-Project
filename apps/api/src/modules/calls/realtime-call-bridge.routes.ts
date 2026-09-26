import { Router, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";

import { requireRealtimeHubService } from "../../middleware/internal-realtime-service.js";
import { authenticate, requireAuthContext } from "../../middleware/authenticate.js";
import { AppError } from "../../core/errors.js";
import { acceptCall, assertSignalingAllowed, cancelCall, cancelCallsForSession, declineCall, endCall, failCall, startCall, callSignal } from "./call.service.js";
import { toCallUserDto } from "./call.dto.js";
import { callIdParamsSchema, callStartSchema } from "./call.validation.js";
import { clearCallTimeout, scheduleCallTimeout } from "./call-timeouts.js";
import type { AuthContext } from "../auth/auth.types.js";
import type { CallDocument } from "./call.types.js";

function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void handler(request, response).catch(next); };
}

const signalSchema = z.object({ callId: z.string().trim().min(1), kind: z.enum(["offer", "answer", "ice"]) });
const sessionSchema = z.object({ sessionId: z.string().trim().min(1).max(256) });
type CallAction = (context: AuthContext, callId: string) => Promise<{ call: CallDocument; changed: boolean }>;

export function createRealtimeCallBridgeRouter(): Router {
  const router = Router();
  router.use(requireRealtimeHubService);

  router.post("/calls/start", authenticate, controller(async (request, response) => {
    const input = callStartSchema.parse(request.body);
    const result = await startCall(requireAuthContext(request), input);
    if (result.changed) await scheduleCallTimeout(result.call._id.toString(), result.call.initiatedAt);
    response.status(201).json({ success: true, data: { call: callSignal(result.call), caller: toCallUserDto(result.caller), changed: result.changed } });
  }));

  const action = (path: string, operation: CallAction): void => {
    router.post(path, authenticate, controller(async (request, response) => {
      const { callId } = callIdParamsSchema.parse(request.body);
      const result = await operation(requireAuthContext(request), callId);
      if (result.changed) await clearCallTimeout(result.call._id.toString());
      response.status(200).json({ success: true, data: { call: callSignal(result.call), changed: result.changed } });
    }));
  };

  action("/calls/accept", acceptCall);
  action("/calls/decline", declineCall);
  action("/calls/cancel", cancelCall);
  action("/calls/end", endCall);
  action("/calls/fail", failCall);

  router.post("/calls/authorize-signal", authenticate, controller(async (request, response) => {
    const input = signalSchema.parse(request.body);
    const context = requireAuthContext(request);
    const target = await assertSignalingAllowed(context, input.callId);
    const isCaller = target.call.callerId.toString() === context.userId;
    if ((input.kind === "offer" && !isCaller) || (input.kind === "answer" && isCaller)) {
      throw new AppError({ code: "CALL_SIGNALING_FORBIDDEN", message: "That signaling message is not valid for this participant.", statusCode: 403 });
    }
    response.status(200).json({ success: true, data: { otherUserId: target.otherUserId } });
  }));

  router.post("/calls/session-disconnected", controller(async (request, response) => {
    const { sessionId } = sessionSchema.parse(request.body);
    const calls = await cancelCallsForSession(sessionId);
    await Promise.all(calls.map((call) => clearCallTimeout(call._id.toString())));
    response.status(200).json({ success: true, data: { calls: calls.map((call) => ({ call: callSignal(call), event: call.status === "cancelled" ? "call:cancelled" : "call:failed" })) } });
  }));

  return router;
}
