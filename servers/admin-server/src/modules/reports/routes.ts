import { Router, type Request, type RequestHandler, type Response } from "express";

import type { AdminServerConfig } from "../../config/env.js";
import { createUserAuthentication } from "../../middleware/authenticate-user.js";
import { createAdminAuthentication, requireAdminContext, requireAdminPermission } from "../../middleware/authenticate-admin.js";
import { createReportSchema, reportIdParamsSchema, reportListQuerySchema, reportStatusSchema } from "../admin/validation.js";
import { createReport, listReports, updateReport } from "./service.js";

function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler { return (request, response, next) => { void handler(request, response).catch(next); }; }

export function createReportRouter(config: AdminServerConfig): Router {
  const router = Router();
  router.use(createUserAuthentication(config));
  router.post("/", controller(async (request, response) => { response.status(201).json({ success: true, data: await createReport(config, request.adminUser!.userId, createReportSchema.parse(request.body)) }); }));
  return router;
}

export function createAdminReportRouter(config: AdminServerConfig): Router {
  const router = Router();
  const authenticateAdmin = createAdminAuthentication(config);
  router.get("/", authenticateAdmin, requireAdminPermission("reports.view"), controller(async (request, response) => { const query = reportListQuerySchema.parse(request.query); response.status(200).json({ success: true, data: await listReports(config, query.status) }); }));
  router.patch("/:reportId", authenticateAdmin, requireAdminPermission("reports.resolve"), controller(async (request, response) => { const { reportId } = reportIdParamsSchema.parse(request.params); response.status(200).json({ success: true, data: { report: await updateReport(config, requireAdminContext(request).adminId, reportId, reportStatusSchema.parse(request.body)) } }); }));
  return router;
}
