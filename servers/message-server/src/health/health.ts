import { Router } from "express";

import { env } from "../config/env.js";
import { getDatabaseStatus } from "../lib/database.js";
import { getRedisStatus } from "../lib/redis.js";

export function createHealthRouter(): Router {
  const router = Router();
  router.get("/health", (_request, response) => response.status(200).json({ success: true, data: { status: "ok", serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION } }));
  router.get("/ready", (_request, response) => {
    const database = getDatabaseStatus();
    const redis = getRedisStatus();
    const ready = database === "connected" && redis === "connected";
    response.status(ready ? 200 : 503).json(ready
      ? { success: true, data: { status: "ready", serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION, dependencies: { database, redis } } }
      : { success: false, error: { code: "MESSAGE_SERVICE_NOT_READY", message: "Message service is not ready." } });
  });
  return router;
}
