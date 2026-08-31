import { redisClient } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { presenceKey } from "../lib/presence.js";

export { isUserOnline, presenceKey } from "../lib/presence.js";

const PRESENCE_TTL_SECONDS = 60;
const PRESENCE_HEARTBEAT_MS = 20_000;
const REGISTER_PRESENCE_SCRIPT = `
  redis.call("SADD", KEYS[1], ARGV[1])
  redis.call("EXPIRE", KEYS[1], ARGV[2])
  if redis.call("SCARD", KEYS[1]) == 1 then
    return 1
  end
  return 0
`;
const STOP_PRESENCE_SCRIPT = `
  if redis.call("SREM", KEYS[1], ARGV[1]) == 0 then
    return -1
  end
  local remaining = redis.call("SCARD", KEYS[1])
  if remaining > 0 then
    redis.call("EXPIRE", KEYS[1], ARGV[2])
    return remaining
  end
  redis.call("DEL", KEYS[1])
  return 0
`;

export interface PresenceStopResult {
  becameOffline: boolean;
  lastSeenAt: Date | null;
}

export interface PresenceRegistration {
  becameOnline: boolean;
  stop: () => Promise<PresenceStopResult>;
}

export async function registerPresence(
  userId: string,
  socketId: string,
): Promise<PresenceRegistration> {
  const key = presenceKey(userId);
  const registrationResult = await redisClient.eval(REGISTER_PRESENCE_SCRIPT, {
    keys: [key],
    arguments: [socketId, String(PRESENCE_TTL_SECONDS)],
  });
  const becameOnline = registrationResult === 1;
  let stopped = false;

  const refresh = async (): Promise<void> => {
    if (stopped || !redisClient.isReady) {
      return;
    }
    await redisClient.sAdd(key, socketId);
    await redisClient.expire(key, PRESENCE_TTL_SECONDS);
  };
  const heartbeat = setInterval(() => {
    void refresh().catch((error: unknown) => {
      logger.warn({ userId }, "Presence heartbeat failed");
      logger.debug({ userId, err: error }, "Presence heartbeat error details");
    });
  }, PRESENCE_HEARTBEAT_MS);

  return {
    becameOnline,
    stop: async () => {
      if (stopped) {
        return { becameOffline: false, lastSeenAt: null };
      }
      stopped = true;
      clearInterval(heartbeat);
      const stopResult = await redisClient.eval(STOP_PRESENCE_SCRIPT, {
        keys: [key],
        arguments: [socketId, String(PRESENCE_TTL_SECONDS)],
      });
      const remaining = Number(stopResult);
      if (!Number.isFinite(remaining)) {
        throw new Error("Redis returned an invalid presence stop result");
      }
      if (remaining < 0) {
        return { becameOffline: false, lastSeenAt: null };
      }
      if (remaining > 0) {
        return { becameOffline: false, lastSeenAt: null };
      }

      const lastSeenAt = new Date();
      return { becameOffline: true, lastSeenAt };
    },
  };
}
