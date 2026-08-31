import { Router } from "express";

import { getHealthSnapshot } from "./health.service.js";
import type { HealthSnapshotProvider } from "./health.types.js";

export function createHealthRouter(
  getSnapshot: HealthSnapshotProvider = getHealthSnapshot,
): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response.status(200).json({ success: true, data: getSnapshot() });
  });

  router.get("/live", (_request, response) => {
    response.status(200).json({
      success: true,
      data: { status: "ok", uptime: process.uptime() },
    });
  });

  router.get("/ready", (_request, response) => {
    const snapshot = getSnapshot();
    response
      .status(snapshot.status === "ok" ? 200 : 503)
      .json({ success: true, data: snapshot });
  });

  return router;
}
