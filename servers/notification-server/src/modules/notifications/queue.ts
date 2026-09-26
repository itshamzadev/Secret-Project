import { env } from "../../config/env.js";
import { logger } from "../../logging/logger.js";
import type { NotificationService } from "./notification.service.js";

export function startNotificationWorker(service: NotificationService): { stop: () => void } {
  if (!env.ENABLE_NOTIFICATION_WORKER) return { stop: () => undefined };
  let stopped = false;
  const tick = (): void => {
    if (stopped) return;
    void service.processOne().catch((error: unknown) => logger.error({ err: error }, "Notification queue processing failed"));
  };
  const timer = setInterval(tick, env.NOTIFICATION_WORKER_INTERVAL_MS);
  timer.unref();
  tick();
  return { stop: () => { stopped = true; clearInterval(timer); } };
}
