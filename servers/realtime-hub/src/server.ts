import { createServer, type Server as HttpServer } from "node:http";

import { createRealtimeApp } from "./app.js";
import { env, allowedWebOrigins } from "./config/env.js";
import { logger } from "./logging/logger.js";
import { connectRedisRuntime, createRedisRuntime } from "./redis/client.js";
import { createRealtimeSocketRuntime } from "./sockets/connection.js";

export interface RealtimeServerRuntime {
  readonly server: HttpServer;
  readonly close: () => Promise<void>;
}

export async function createRealtimeServer(): Promise<RealtimeServerRuntime> {
  const redis = createRedisRuntime();
  await connectRedisRuntime(redis);
  const httpServer = createServer(createRealtimeApp(redis));
  const sockets = await createRealtimeSocketRuntime(httpServer, redis, allowedWebOrigins);
  return {
    server: httpServer,
    close: async () => {
      await sockets.close();
      if (httpServer.listening) await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
      await redis.close();
    }
  };
}

async function start(): Promise<void> {
  const runtime = await createRealtimeServer();
  const shutdown = async (signal: string) => {
    try { await runtime.close(); logger.info({ signal }, "Realtime Hub stopped"); } catch (error: unknown) { logger.error({ err: error }, "Realtime Hub shutdown failed"); process.exitCode = 1; }
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  await new Promise<void>((resolve, reject) => {
    runtime.server.once("error", reject);
    runtime.server.listen(env.PORT, "0.0.0.0", () => { runtime.server.removeListener("error", reject); logger.info({ port: env.PORT }, "Realtime Hub listening"); resolve(); });
  });
}

if (process.env.NODE_ENV !== "test") void start().catch((error: unknown) => { logger.fatal({ err: error }, "Realtime Hub startup failed"); process.exitCode = 1; });
