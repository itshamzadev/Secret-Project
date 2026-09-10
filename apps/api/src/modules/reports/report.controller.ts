import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAdminContext } from "../../middleware/authenticate-admin.js";
import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  createReport,
  listAdminReports,
  updateAdminReport,
} from "./report.service.js";
import {
  createReportSchema,
  reportIdParamsSchema,
  reportStatusSchema,
} from "./report.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

export const createReportController: RequestHandler = controller(
  async (request, response) => {
    response.status(201).json({
      success: true,
      data: await createReport(
        requireAuthContext(request),
        createReportSchema.parse(request.body),
      ),
    });
  },
);

export const adminReportsController: RequestHandler = controller(
  async (request, response) => {
    const status =
      typeof request.query.status === "string" &&
      ["open", "resolved", "dismissed"].includes(request.query.status)
        ? (request.query.status as "open" | "resolved" | "dismissed")
        : undefined;
    response
      .status(200)
      .json({ success: true, data: await listAdminReports(status) });
  },
);

export const adminReportStatusController: RequestHandler = controller(
  async (request, response) => {
    const { reportId } = reportIdParamsSchema.parse(request.params);
    response.status(200).json({
      success: true,
      data: {
        report: await updateAdminReport(
          requireAdminContext(request),
          reportId,
          reportStatusSchema.parse(request.body),
        ),
      },
    });
  },
);
