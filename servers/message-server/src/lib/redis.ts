import { createClient } from "redis";

import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const redisClient = createClient({ url: env.REDIS_URL });
redisClient.on("error", (error: Error) => logger.error({ err: error }, "Message Redis error"));

export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) await redisClient.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient.isOpen) await redisClient.quit();
}

export function getRedisStatus(): "connected" | "disconnected" {
  return redisClient.isReady ? "connected" : "disconnected";
}
