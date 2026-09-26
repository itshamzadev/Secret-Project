import { Router } from "express";

import { env } from "../config/env.js";
import { databaseStatus } from "../database/mongo.js";
import { mediaStorage } from "../storage/index.js";

export function createHealthRouter(storageReady: () => boolean): Router {
  const router = Router();
  router.get("/health", (_request, response) => response.status(200).json({ success: true, data: { status: "ok", serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION } }));
  router.get("/ready", (_request, response) => {
    const database = databaseStatus();
    const storage = storageReady() && env.MEDIA_STORAGE_DRIVER === "local" ? "connected" : "disconnected";
    const ready = database === "connected" && storage === "connected";
    response.status(ready ? 200 : 503).json(ready ? { success: true, data: { status: "ready", serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION, dependencies: { database, storage } } } : { success: false, error: { code: "MEDIA_SERVICE_NOT_READY", message: "Media service is not ready." } });
  });
  void mediaStorage;
  return router;
}
