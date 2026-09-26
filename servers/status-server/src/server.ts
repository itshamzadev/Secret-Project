import "dotenv/config";

import { createServer } from "node:http";

import { createStatusApp } from "./app.js";
import { createStatusServerConfig } from "./config.js";
import { connectDatabase, disconnectDatabase, getDatabaseStatus } from "./database.js";
import { createLogger } from "./logging/logger.js";
import { StatusModel } from "./models/status.model.js";

export async function startStatusServer(): Promise<void> {
  const config = createStatusServerConfig();
  const logger = createLogger(config);
  const app = createStatusApp(config, { databaseStatus: getDatabaseStatus });
  const server = createServer(app);
  let stopping = false;
  const close = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await new Promise<void>((resolve) => { if (!server.listening) { resolve(); return; } server.close(() => resolve()); });
    await disconnectDatabase();
    logger.info({ signal }, "Status server stopped");
  };
  process.once("SIGINT", () => { void close("SIGINT"); });
  process.once("SIGTERM", () => { void close("SIGTERM"); });
  try {
    await connectDatabase(config);
    await StatusModel.init();
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(config.PORT, "0.0.0.0", () => { server.removeListener("error", reject); resolve(); }); });
    logger.info({ port: config.PORT }, "Status server listening");
  } catch (error) {
    logger.fatal({ err: error }, "Status server startup failed");
    await close("startup-failure");
    throw error;
  }
}

if (process.env.NODE_ENV !== "test") void startStatusServer().catch(() => { process.exitCode = 1; });
