import { createClient } from "redis";

import type { AuthServerConfig } from "./config.js";

export const sessionRevocationChannel = "terqivo:auth:session-revoked:v1";
let redisClient: ReturnType<typeof createClient> | undefined;

export async function connectRedis(config: AuthServerConfig): Promise<void> {
  redisClient = createClient({ url: config.REDIS_URL });
  await redisClient.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient?.isOpen === true) await redisClient.quit();
  redisClient = undefined;
}

export function getRedisStatus(): "connected" | "disconnected" {
  return redisClient?.isReady === true ? "connected" : "disconnected";
}

export async function isUserOnline(userId: string): Promise<boolean> {
  if (redisClient?.isReady !== true) return false;
  return (await redisClient.sCard(`presence:user:${userId}:connections`)) > 0;
}

export async function publishSessionRevoked(sessionId: string): Promise<void> {
  if (redisClient?.isReady !== true) return;
  await redisClient.publish(sessionRevocationChannel, sessionId);
}
