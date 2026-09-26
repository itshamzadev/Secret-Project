import "dotenv/config";

import { createServer } from "node:http";

import { createAdminApp } from "./app.js";
import { createAdminServerConfig } from "./config/env.js";
import { connectDatabase, disconnectDatabase, getDatabaseStatus } from "./database/mongo.js";
import { createAdminRedisClient, getRedisStatus } from "./redis/client.js";
import { logger } from "./logging/logger.js";

export async function startAdminServer(): Promise<void> {
  const config = createAdminServerConfig();
  const redis = createAdminRedisClient(config);
  const countOnlineUsers = async (): Promise<number> => {
    if (!redis.isReady) return 0;
    let count = 0;
    for await (const keys of redis.scanIterator({ MATCH: "presence:user:*:connections", COUNT: 100 })) {
      for (const key of keys) if (await redis.sCard(key) > 0) count += 1;
    }
    return count;
  };
  const app = createAdminApp(config, { databaseStatus: getDatabaseStatus, redisStatus: () => getRedisStatus(redis), countOnlineUsers });
  const server = createServer(app);
  await connectDatabase(config);
  await redis.connect();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(config.PORT, "0.0.0.0", () => { server.removeListener("error", reject); resolve(); }); });
  const close = async (signal: string) => { await new Promise<void>((resolve) => server.close(() => resolve())); if (redis.isOpen) await redis.quit(); await disconnectDatabase(); logger.info({ signal }, "Admin server stopped"); };
  process.once("SIGINT", () => { void close("SIGINT"); });
  process.once("SIGTERM", () => { void close("SIGTERM"); });
  logger.info({ port: config.PORT }, "Admin server listening");
}

if (process.env.NODE_ENV !== "test") void startAdminServer().catch((error: unknown) => { logger.fatal({ err: error }, "Admin server startup failed"); process.exitCode = 1; });
