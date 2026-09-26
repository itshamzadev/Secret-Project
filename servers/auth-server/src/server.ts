import "dotenv/config";

import { createServer } from "node:http";

import { initializeAuthModels } from "./internal/auth-core/index.js";
import { initializePrivacyModels } from "./internal/privacy.service.js";
import { PresenceSessionModel } from "./internal/presence.model.js";
import { createServiceLogger } from "./logging/logger.js";

import { createAuthApp } from "./app.js";
import { createAuthServerConfig } from "./config.js";
import { connectDatabase, disconnectDatabase, getDatabaseStatus } from "./database.js";
import { connectRedis, disconnectRedis, getRedisStatus } from "./redis.js";

export async function startAuthServer(): Promise<void> {
  const config = createAuthServerConfig();
  const logger = createServiceLogger({ serviceName: config.SERVICE_NAME, level: config.LOG_LEVEL });
  const app = createAuthApp(config, { logger, getDatabaseStatus, getRedisStatus });
  const server = createServer(app);
  let closing = false;
  const close = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
    await Promise.all([disconnectDatabase(), disconnectRedis()]);
    logger.info({ signal }, "Auth server stopped");
  };
  process.once("SIGINT", () => { void close("SIGINT"); });
  process.once("SIGTERM", () => { void close("SIGTERM"); });
  try {
    await Promise.all([connectDatabase(config), connectRedis(config)]);
    await Promise.all([initializeAuthModels(), initializePrivacyModels(), PresenceSessionModel.init()]);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(config.PORT, "0.0.0.0", () => { server.removeListener("error", reject); resolve(); }); });
    logger.info({ port: config.PORT }, "Auth server listening");
  } catch (error) {
    logger.fatal({ err: error }, "Auth server startup failed");
    await close("startup-failure");
    throw error;
  }
}

if (process.env.NODE_ENV !== "test") void startAuthServer().catch(() => { process.exitCode = 1; });
