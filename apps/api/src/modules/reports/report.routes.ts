import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  authenticateAdmin,
  requireAdminPermission,
} from "../../middleware/authenticate-admin.js";
import {
  adminReportStatusController,
  adminReportsController,
  createReportController,
} from "./report.controller.js";

export function createReportRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/", createReportController);
  return router;
}

export function createAdminReportRouter(): Router {
  const router = Router();
  router.get(
    "/",
    authenticateAdmin,
    requireAdminPermission("reports.view"),
    adminReportsController,
  );
  router.patch(
    "/:reportId",
    authenticateAdmin,
    requireAdminPermission("reports.resolve"),
    adminReportStatusController,
  );
  return router;
}
