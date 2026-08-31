import { createClient } from "redis";

import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const redisClient = createClient({ url: env.REDIS_URL });

redisClient.on("error", (error: Error) => {
  logger.error({ err: error }, "Redis client error");
});

export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    logger.info("Connecting to Redis");
    await redisClient.connect();
    logger.info("Redis connection established");
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient.isOpen) {
    await redisClient.quit();
    logger.info("Redis connection closed");
  }
}

export function getRedisStatus(): "connected" | "disconnected" {
  return redisClient.isReady ? "connected" : "disconnected";
}
