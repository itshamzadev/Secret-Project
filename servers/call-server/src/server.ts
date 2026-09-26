import { createServer } from "node:http";

import { createCallApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./lib/database.js";
import { connectRedis, disconnectRedis } from "./lib/redis.js";
import { initializeCallModels } from "./modules/calls/call.service.js";
import { recoverCallTimeouts, startCallTimeoutCoordinator } from "./realtime/timeout.js";

const httpServer = createServer(createCallApp());
let timeoutCoordinator: { stop: () => void } | undefined;
let stopping = false;

export async function startCallServer(): Promise<void> {
  await Promise.all([connectDatabase(), connectRedis()]);
  await initializeCallModels();
  await recoverCallTimeouts();
  timeoutCoordinator = startCallTimeoutCoordinator();
  await new Promise<void>((resolve, reject) => { httpServer.once("error", reject); httpServer.listen(env.PORT, "0.0.0.0", () => { httpServer.removeListener("error", reject); resolve(); }); });
  console.info(`Terqivo Call Server listening on ${env.PORT}`);
}

export async function shutdownCallServer(): Promise<void> {
  if (stopping) return;
  stopping = true;
  timeoutCoordinator?.stop();
  await new Promise<void>((resolve, reject) => { if (!httpServer.listening) { resolve(); return; } httpServer.close((error) => error ? reject(error) : resolve()); });
  await Promise.all([disconnectDatabase(), disconnectRedis()]);
}

process.once("SIGINT", () => void shutdownCallServer());
process.once("SIGTERM", () => void shutdownCallServer());

if (env.NODE_ENV !== "test") void startCallServer().catch(() => { process.exitCode = 1; });
