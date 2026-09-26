import { Router } from "express";

import { AppError } from "../core/errors.js";
import { verifyServiceToken } from "./service-auth.js";
import type { NotificationService } from "../modules/notifications/notification.service.js";
import { notificationIntentSchema } from "../modules/notifications/notification.validation.js";
import { NotificationModel } from "../models/notification.model.js";
import { PushDeviceModel } from "../models/push-device.model.js";

export function createInternalNotificationRouter(service: NotificationService): Router {
  const router = Router();
  router.use(async (request, _response, next) => {
    try { await verifyServiceToken(request.get("x-internal-service-token")); next(); }
    catch { next(new AppError({ statusCode: 401, code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required." })); }
  });
  router.post("/notifications", async (request, response, next) => {
    try {
      const intent = notificationIntentSchema.parse(request.body);
      const result = await service.enqueue(intent);
      response.status(202).json({ success: true, data: { notificationId: result.record.id, duplicate: result.duplicate, status: result.record.status } });
    } catch (error: unknown) { next(error); }
  });
  router.get("/admin/stats", async (_request, response, next) => { try { const enabled = await PushDeviceModel.countDocuments({ enabled: true }); response.json({ success: true, data: { pushDevices: { enabled }, notifications: { total: await NotificationModel.countDocuments() } } }); } catch (error) { next(error); } });
  return router;
}
