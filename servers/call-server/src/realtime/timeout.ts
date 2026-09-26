import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { redisClient } from "../lib/redis.js";
import { CallModel } from "../models/call.model.js";
import { markCallMissed } from "../modules/calls/call.service.js";
import { callEvent, publishCallEvent } from "./events.js";
import { notifyMissedCall } from "./push.js";

const timeoutSetKey = "terqivo:call-timeouts";
const timeoutLockPrefix = "terqivo:call-timeout-lock:";
const pollIntervalMs = 5_000;

export async function scheduleCallTimeout(callId: string, initiatedAt: Date): Promise<void> {
  await redisClient.zAdd(timeoutSetKey, { score: initiatedAt.getTime() + env.CALL_RING_TIMEOUT_SECONDS * 1000, value: callId });
}

export async function clearCallTimeout(callId: string): Promise<void> { await redisClient.zRem(timeoutSetKey, callId); }

export async function recoverCallTimeouts(): Promise<void> {
  const calls = await CallModel.find({ status: "ringing" }).select({ _id: 1, initiatedAt: 1 }).exec();
  for (const call of calls) await scheduleCallTimeout(call._id.toString(), call.initiatedAt);
}

async function processExpired(): Promise<void> {
  const expiredIds = await redisClient.zRangeByScore(timeoutSetKey, 0, Date.now());
  for (const callId of expiredIds) {
    const lock = await redisClient.set(`${timeoutLockPrefix}${callId}`, "1", { NX: true, EX: 10 });
    if (lock !== "OK") continue;
    const call = await markCallMissed(callId);
    await redisClient.zRem(timeoutSetKey, callId);
    if (call !== null) {
      await publishCallEvent({ ...callEvent(call, "call:missed"), targetUserIds: [call.callerId.toString(), call.calleeId.toString()] });
      await notifyMissedCall(call);
    }
  }
}

export function startCallTimeoutCoordinator(): { stop: () => void } {
  let stopped = false;
  const process = (): void => {
    if (stopped) return;
    void processExpired().catch((error: unknown) => logger.error({ err: error }, "Call timeout reconciliation failed"));
  };
  const interval = setInterval(process, pollIntervalMs);
  process();
  return { stop: () => { stopped = true; clearInterval(interval); } };
}
