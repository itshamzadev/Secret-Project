import { RedisMemoryServer } from "redis-memory-server";

let redisServer: RedisMemoryServer | undefined;

/**
 * Use an explicitly supplied test Redis when CI provides one. Otherwise start
 * a real, isolated Redis-compatible server for this Vitest worker. This keeps
 * Socket.IO Redis-adapter tests meaningful without requiring Docker or a
 * developer-managed daemon.
 */
export async function startTestRedis(): Promise<void> {
  const configuredUrl = process.env.TEST_REDIS_URL?.trim();
  if (configuredUrl) {
    process.env.REDIS_URL = configuredUrl;
    return;
  }

  redisServer = new RedisMemoryServer();
  const [host, port] = await Promise.all([
    redisServer.getHost(),
    redisServer.getPort(),
  ]);
  process.env.REDIS_URL = `redis://${host}:${port}`;
}

export async function stopTestRedis(): Promise<void> {
  if (redisServer === undefined) {
    return;
  }

  await redisServer.stop();
  redisServer = undefined;
}
