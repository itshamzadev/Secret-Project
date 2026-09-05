import { createServer, type Server as HttpServer } from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./lib/database.js";
import { logger } from "./lib/logger.js";
import { connectRedis, disconnectRedis } from "./lib/redis.js";
import { initializeAuthModels } from "./modules/auth/auth.service.js";
import { initializeContactModels } from "./modules/contacts/contact.service.js";
import { initializeConversationModels } from "./modules/conversations/conversation.service.js";
import { initializeMessageModels } from "./modules/messages/message.service.js";
import { initializePresenceModels } from "./modules/users/presence.service.js";
import { initializeCallModels } from "./modules/calls/call.service.js";
import { initializeNotificationModels } from "./modules/notifications/notification.service.js";
import { initializeAdminModels } from "./modules/admin/admin.service.js";
import { initializeMediaStorage } from "./modules/media/media.storage.js";
import { initializeBlockModels } from "./modules/privacy/block.service.js";
import { createSocketServer, type SocketRuntime } from "./sockets/index.js";

const app = createApp();
const httpServer = createServer(app);
let socketRuntime: SocketRuntime | undefined;
let shuttingDown = false;

async function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  try {
    if (socketRuntime !== undefined) {
      await socketRuntime.close();
      socketRuntime = undefined;
    }
    await closeHttpServer(httpServer);
    await Promise.all([disconnectDatabase(), disconnectRedis()]);
    process.exitCode = exitCode;
    logger.info("Graceful shutdown completed");
  } catch (error) {
    process.exitCode = 1;
    logger.error({ err: error }, "Graceful shutdown failed");
  }
}

export async function startServer(): Promise<void> {
  try {
    await Promise.all([connectDatabase(), connectRedis()]);
    await initializeAuthModels();
    await initializeContactModels();
    await initializeConversationModels();
    await initializeMessageModels();
    await initializePresenceModels();
    await initializeCallModels();
    await initializeNotificationModels();
    await initializeBlockModels();
    await initializeAdminModels();
    await initializeMediaStorage();
    socketRuntime = await createSocketServer(httpServer);

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        httpServer.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off("error", onError);
        resolve();
      };

      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(env.PORT);
    });

    logger.info({ port: env.PORT }, "Terqivo Connect API listening");
  } catch (error) {
    logger.fatal({ err: error }, "API startup failed");
    await shutdown("startup-failure", 1);
    throw error;
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled promise rejection");
  void shutdown("unhandledRejection", 1);
});

if (env.NODE_ENV !== "test") {
  void startServer().catch(() => {
    process.exitCode = 1;
  });
}
