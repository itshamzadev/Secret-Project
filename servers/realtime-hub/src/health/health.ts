import type { RequestHandler } from "express";

import type { RedisRuntime } from "../redis/client.js";
import { env } from "../config/env.js";

export function createHealthHandlers(redis: RedisRuntime): { health: RequestHandler; ready: RequestHandler } {
  const health: RequestHandler = (_request, response) => {
    response.status(200).json({ success: true, data: { status: "ok", serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION } });
  };
  const ready: RequestHandler = async (_request, response) => {
    try {
      await redis.command.ping();
      response.status(200).json({ success: true, data: { status: "ready", serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION, dependencies: { redis: "connected" } } });
    } catch {
      response.status(503).json({ success: false, error: { code: "REALTIME_HUB_NOT_READY", message: "Realtime Hub is not ready." } });
    }
  };
  return { health, ready };
}
