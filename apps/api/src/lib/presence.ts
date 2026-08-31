import { redisClient } from "./redis.js";

export function presenceKey(userId: string): string {
  return `presence:user:${userId}:connections`;
}

export async function isUserOnline(userId: string): Promise<boolean> {
  return (await redisClient.sCard(presenceKey(userId))) > 0;
}
