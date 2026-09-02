import { Router } from "express";
import rateLimit from "express-rate-limit";

import { authenticate } from "../../middleware/authenticate.js";
import {
  registerPushDeviceController,
  removePushDeviceController,
  diagnosticPushController,
} from "./notification.controller.js";

const diagnosticPushRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1,
  keyGenerator: (request) => request.auth?.userId ?? request.ip ?? "unknown",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "PUSH_DIAGNOSTIC_RATE_LIMITED",
      message: "The diagnostic push limit has been reached. Try again later.",
    },
  },
});

export function createNotificationRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/devices", registerPushDeviceController);
  router.delete("/devices", removePushDeviceController);
  // Temporary authenticated verification route. Remove after physical push verification.
  router.post(
    "/diagnostics/test-push",
    diagnosticPushRateLimiter,
    diagnosticPushController,
  );
  return router;
}
