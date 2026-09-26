import { logger } from "../logging/logger.js";
import type { RedisRuntime } from "../redis/client.js";

const PRESENCE_TTL_SECONDS = 60;
const HEARTBEAT_MS = 20_000;

export interface PresenceRegistration {
  becameOnline: boolean;
  stop: () => Promise<{ becameOffline: boolean }>;
}

function key(userId: string): string {
  return `presence:user:${userId}:connections`;
}

export async function registerPresence(redis: RedisRuntime, userId: string, socketId: string): Promise<PresenceRegistration> {
  const presenceKey = key(userId);
  const before = await redis.command.sCard(presenceKey);
  await redis.command.sAdd(presenceKey, socketId);
  await redis.command.expire(presenceKey, PRESENCE_TTL_SECONDS);
  let stopped = false;
  const heartbeat = setInterval(() => {
    if (stopped || !redis.command.isReady) return;
    void redis.command.sAdd(presenceKey, socketId).then(() => redis.command.expire(presenceKey, PRESENCE_TTL_SECONDS)).catch((error: unknown) => logger.debug({ userId, err: error }, "Realtime presence heartbeat failed"));
  }, HEARTBEAT_MS);
  return {
    becameOnline: before === 0,
    stop: async () => {
      if (stopped) return { becameOffline: false };
      stopped = true;
      clearInterval(heartbeat);
      await redis.command.sRem(presenceKey, socketId);
      const remaining = await redis.command.sCard(presenceKey);
      if (remaining === 0) await redis.command.del(presenceKey);
      return { becameOffline: remaining === 0 };
    }
  };
}
