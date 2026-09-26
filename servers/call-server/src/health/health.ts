import { Router } from "express";

import { env } from "../config/env.js";
import { databaseStatus } from "../lib/database.js";
import { redisStatus } from "../lib/redis.js";

export function createHealthRouter(): Router {
  const router = Router();
  router.get("/health", (_request, response) => response.status(200).json({ success: true, data: { status: "ok", serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION } }));
  router.get("/ready", (_request, response) => {
    const ready = databaseStatus() === "connected" && redisStatus() === "connected";
    response.status(ready ? 200 : 503).json({ success: ready, data: ready ? { status: "ready", serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION, database: databaseStatus(), redis: redisStatus() } : undefined, error: ready ? undefined : { code: "CALL_SERVER_NOT_READY", message: "Call service dependencies are not ready." } });
  });
  return router;
}
