import type { AdminServerConfig } from "../config/env.js";
import { callInternal } from "./http.js";

export async function getCallStats(config: AdminServerConfig) {
  return callInternal<{ success: true; data: { calls: { total: number; missed: number } } }>(config, config.CALL_SERVICE_URL, "/internal/admin/stats");
}
