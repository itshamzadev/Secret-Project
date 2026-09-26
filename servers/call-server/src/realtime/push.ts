import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { UserModel } from "../models/user.model.js";
import { isUserBlockedEitherDirection } from "../modules/privacy/block.service.js";
import type { CallDocument } from "../models/call.types.js";

type CallPushKind = "incoming_call" | "missed_call";

async function serviceToken(): Promise<string> {
  if (env.INTERNAL_SERVICE_SECRET === undefined) throw new Error("NOTIFICATION_SERVICE_AUTH_NOT_CONFIGURED");
  return new SignJWT({ serviceName: "call-server" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.INTERNAL_SERVICE_ISSUER)
    .setAudience(env.INTERNAL_SERVICE_AUDIENCE)
    .setSubject("call-server")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET));
}

async function sendCallPush(call: CallDocument, kind: CallPushKind): Promise<void> {
  if (!env.ENABLE_PUSH_NOTIFICATIONS) return;
  if (env.NOTIFICATION_SERVICE_URL === undefined) throw new Error("NOTIFICATION_SERVICE_UNAVAILABLE");
  if (await isUserBlockedEitherDirection(call.callerId.toString(), call.calleeId.toString())) return;
  const caller = await UserModel.findById(call.callerId).select({ displayName: 1 }).lean().exec();
  if (caller === null) return;
  const token = await serviceToken();
  const response = await fetch(`${env.NOTIFICATION_SERVICE_URL}/internal/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "x-internal-service-token": token, "x-request-id": randomUUID(), "x-correlation-id": randomUUID() },
    body: JSON.stringify({
      recipientUserId: call.calleeId.toString(),
      type: kind,
      title: kind === "incoming_call" ? `Incoming ${call.type} call` : `Missed ${call.type} call`,
      body: kind === "incoming_call" ? `${caller.displayName} is calling you` : caller.displayName,
      data: { type: kind, callId: call._id.toString(), callerId: call.callerId.toString(), callType: call.type },
      channelId: "calls",
      deduplicationKey: `terqivo:push:${kind}:${call._id.toString()}`,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`NOTIFICATION_SERVICE_HTTP_${response.status}`);
  logger.info({ event: `push.${kind}_requested`, callId: call._id.toString(), recipientId: call.calleeId.toString() }, "Notification Server accepted call push");
}

export function notifyIncomingCall(call: CallDocument): Promise<void> {
  return sendCallPush(call, "incoming_call").catch((error: unknown) => { logger.warn({ err: error, callId: call._id.toString() }, "Incoming call notification request failed"); });
}

export function notifyMissedCall(call: CallDocument): Promise<void> {
  return sendCallPush(call, "missed_call").catch((error: unknown) => { logger.warn({ err: error, callId: call._id.toString() }, "Missed call notification request failed"); });
}
