import { createServer } from "node:http";

import { createNotificationApp } from "./app.js";
import { connectDatabase, databaseStatus, disconnectDatabase, initializeNotificationModels } from "./database/mongo.js";
import { env } from "./config/env.js";
import { connectRedis, disconnectRedis, redisStatus } from "./redis/client.js";
import { logger } from "./logging/logger.js";
import { mongoNotificationRepository, mongoPushDeviceRepository } from "./modules/notifications/repositories.js";
import { ExpoPushProvider } from "./modules/notifications/expo.provider.js";
import { NotificationService } from "./modules/notifications/notification.service.js";
import { startNotificationWorker } from "./modules/notifications/queue.js";

const service = new NotificationService(mongoNotificationRepository, mongoPushDeviceRepository, new ExpoPushProvider());
const app = createNotificationApp({ service, devices: mongoPushDeviceRepository, databaseStatus, redisStatus });
const httpServer = createServer(app);
let worker: { stop: () => void } | null = null;
let stopping = false;

export async function startNotificationServer(): Promise<void> {
  await Promise.all([connectDatabase(), connectRedis()]);
  await initializeNotificationModels();
  await new Promise<void>((resolve, reject) => { httpServer.once("error", reject); httpServer.listen(env.PORT, "0.0.0.0", () => { httpServer.removeListener("error", reject); resolve(); }); });
  worker = startNotificationWorker(service);
  logger.info({ port: env.PORT }, "Notification server listening");
}

export async function shutdownNotificationServer(): Promise<void> {
  if (stopping) return;
  stopping = true;
  worker?.stop();
  await new Promise<void>((resolve, reject) => { if (!httpServer.listening) { resolve(); return; } httpServer.close((error) => error ? reject(error) : resolve()); });
  await Promise.all([disconnectDatabase(), disconnectRedis()]);
  logger.info("Notification server stopped");
}

process.once("SIGINT", () => { void shutdownNotificationServer(); });
process.once("SIGTERM", () => { void shutdownNotificationServer(); });

if (env.NODE_ENV !== "test") void startNotificationServer().catch((error: unknown) => { logger.fatal({ err: error }, "Notification server failed to start"); process.exitCode = 1; });
