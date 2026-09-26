import { createClient, type RedisClientType } from "redis";

import { env } from "../config/env.js";
import { logger } from "../logging/logger.js";

export type RealtimeRedisClient = RedisClientType;

export interface RedisRuntime {
  readonly command: RealtimeRedisClient;
  readonly adapterPub: RealtimeRedisClient;
  readonly adapterSub: RealtimeRedisClient;
  close: () => Promise<void>;
}

export function createRedisRuntime(url = env.REDIS_URL): RedisRuntime {
  const command = createClient({ url });
  const adapterPub = command.duplicate();
  const adapterSub = command.duplicate();
  for (const client of [command, adapterPub, adapterSub]) {
    client.on("error", (error: Error) => logger.error({ err: error }, "Realtime Redis client error"));
  }
  return {
    command,
    adapterPub,
    adapterSub,
    close: async () => {
      await Promise.all([command, adapterPub, adapterSub].map(async (client) => {
        if (client.isOpen) await client.quit();
      }));
    }
  };
}

export async function connectRedisRuntime(runtime: RedisRuntime): Promise<void> {
  await Promise.all([runtime.command.connect(), runtime.adapterPub.connect(), runtime.adapterSub.connect()]);
}
