import type { RequestHandler, Request, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { callIdParamsSchema, callHistoryQuerySchema } from "./call.validation.js";
import { getCallDetails, listCallHistory } from "./call.service.js";
function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void handler(request, response).catch(next); };
}

export const listCallsController: RequestHandler = controller(async (request, response) => {
  const result = await listCallHistory(requireAuthContext(request), callHistoryQuerySchema.parse(request.query));
  response.status(200).json({ success: true, data: result });
});

export const callDetailsController: RequestHandler = controller(async (request, response) => {
  const { callId } = callIdParamsSchema.parse(request.params);
  const call = await getCallDetails(requireAuthContext(request), callId);
  response.status(200).json({ success: true, data: { call } });
});
