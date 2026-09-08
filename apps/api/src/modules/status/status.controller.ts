import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { createStatus, deleteStatus, listStatuses, markStatusViewed } from "./status.service.js";
import { createStatusSchema, statusIdParamsSchema } from "./status.validation.js";

function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

export const listStatusesController: RequestHandler = controller(async (request, response) => {
  response.status(200).json({ success: true, data: await listStatuses(requireAuthContext(request)) });
});

export const createStatusController: RequestHandler = controller(async (request, response) => {
  const status = await createStatus(requireAuthContext(request), createStatusSchema.parse(request.body));
  response.status(201).json({ success: true, data: { status } });
});

export const viewStatusController: RequestHandler = controller(async (request, response) => {
  const { statusId } = statusIdParamsSchema.parse(request.params);
  await markStatusViewed(requireAuthContext(request), statusId);
  response.status(200).json({ success: true, data: { viewed: true } });
});

export const deleteStatusController: RequestHandler = controller(async (request, response) => {
  const { statusId } = statusIdParamsSchema.parse(request.params);
  await deleteStatus(requireAuthContext(request), statusId);
  response.status(200).json({ success: true, data: { deleted: true } });
});
