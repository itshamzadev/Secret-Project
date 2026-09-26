import { Router } from "express";

export function createHealthRouter(input: { serviceName: string; version: string; database: () => string; redis: () => string }): Router {
  const router = Router();
  router.get("/health", (_request, response) => response.status(200).json({ success: true, data: { status: "ok", serviceName: input.serviceName, version: input.version } }));
  router.get("/ready", (_request, response) => {
    const database = input.database();
    const redis = input.redis();
    const ready = database === "connected" && redis === "connected";
    response.status(ready ? 200 : 503).json(ready ? { success: true, data: { status: "ready", serviceName: input.serviceName, version: input.version, dependencies: { database, redis } } } : { success: false, error: { code: "NOTIFICATION_SERVER_NOT_READY", message: "Notification service dependencies are not ready." }, data: { dependencies: { database, redis } } });
  });
  return router;
}
