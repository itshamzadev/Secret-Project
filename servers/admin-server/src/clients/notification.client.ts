import type { AdminServerConfig } from "../config/env.js";
import { callInternal } from "./http.js";

export async function getNotificationStats(config: AdminServerConfig) {
  return callInternal<{ success: true; data: { pushDevices: { enabled: number }; notifications: { total: number } } }>(config, config.NOTIFICATION_SERVICE_URL, "/internal/admin/stats");
}
