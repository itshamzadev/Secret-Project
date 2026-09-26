import { createServer } from "node:http";

import { createMessageApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./lib/database.js";
import { connectRedis, disconnectRedis } from "./lib/redis.js";
import { initializeConversationModels } from "./modules/conversations/conversation.service.js";
import { initializeMessageModels } from "./modules/messages/message.service.js";
import { initializeGroupModels } from "./modules/groups/group.service.js";
import { initializeChannelModels } from "./modules/channels/channel.service.js";
import { initializeE2EFEModels } from "./modules/e2efe/e2efe.service.js";
import { initializeMediaStorage } from "./modules/media/media.storage.js";

const httpServer = createServer(createMessageApp());
let stopping = false;

export async function startMessageServer(): Promise<void> {
  await Promise.all([connectDatabase(), connectRedis()]);
  await Promise.all([initializeConversationModels(), initializeMessageModels(), initializeGroupModels(), initializeChannelModels(), initializeE2EFEModels(), initializeMediaStorage()]);
  await new Promise<void>((resolve, reject) => { httpServer.once("error", reject); httpServer.listen(env.PORT, "0.0.0.0", () => { httpServer.removeListener("error", reject); resolve(); }); });
  console.info(`Terqivo Message Server listening on ${env.PORT}`);
}

export async function shutdownMessageServer(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve, reject) => { if (!httpServer.listening) { resolve(); return; } httpServer.close((error) => error ? reject(error) : resolve()); });
  await Promise.all([disconnectDatabase(), disconnectRedis()]);
}

process.once("SIGINT", () => void shutdownMessageServer());
process.once("SIGTERM", () => void shutdownMessageServer());

if (env.NODE_ENV !== "test") void startMessageServer().catch(() => { process.exitCode = 1; });
