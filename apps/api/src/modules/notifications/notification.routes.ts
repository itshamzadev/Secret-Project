import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  registerPushDeviceController,
  removePushDeviceController,
} from "./notification.controller.js";

export function createNotificationRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/devices", registerPushDeviceController);
  router.delete("/devices", removePushDeviceController);
  return router;
}
