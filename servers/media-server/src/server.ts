import { createServer } from "node:http";

import { createMediaApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./database/mongo.js";
import { logger } from "./logging/logger.js";
import { initializeMediaStorage, mediaStorage } from "./storage/index.js";

const httpServer = createServer(createMediaApp({ storageReady: () => true }));
let stopping = false;

export async function startMediaServer(): Promise<void> {
  await connectDatabase();
  await initializeMediaStorage();
  await new Promise<void>((resolve, reject) => { httpServer.once("error", reject); httpServer.listen(env.PORT, "0.0.0.0", () => { httpServer.removeListener("error", reject); resolve(); }); });
  logger.info({ port: env.PORT, storageDriver: env.MEDIA_STORAGE_DRIVER }, "Media Server listening");
}

export async function shutdownMediaServer(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve, reject) => { if (!httpServer.listening) { resolve(); return; } httpServer.close((error) => error ? reject(error) : resolve()); });
  await disconnectDatabase();
  void mediaStorage;
}

process.once("SIGINT", () => void shutdownMediaServer());
process.once("SIGTERM", () => void shutdownMediaServer());

if (env.NODE_ENV !== "test") void startMediaServer().catch((error: unknown) => { logger.error({ err: error }, "Media Server failed to start"); process.exitCode = 1; });
