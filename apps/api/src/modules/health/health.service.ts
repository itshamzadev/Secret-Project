import { getDatabaseStatus } from "../../lib/database.js";
import { getRedisStatus } from "../../lib/redis.js";
import type { HealthSnapshot } from "./health.types.js";

export function getHealthSnapshot(): HealthSnapshot {
  const database = getDatabaseStatus();
  const redis = getRedisStatus();

  return {
    status:
      database === "connected" && redis === "connected" ? "ok" : "degraded",
    database,
    redis,
    uptime: process.uptime(),
  };
}
