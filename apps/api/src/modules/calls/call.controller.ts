import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  callHistoryQuerySchema,
  callIdParamsSchema,
} from "./call.validation.js";
import { getCallDetails, listCallHistory } from "./call.service.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

async function handleList(request: Request, response: Response): Promise<void> {
  const result = await listCallHistory(
    requireAuthContext(request),
    callHistoryQuerySchema.parse(request.query),
  );
  response.status(200).json({ success: true, data: result });
}

async function handleDetails(
  request: Request,
  response: Response,
): Promise<void> {
  const { callId } = callIdParamsSchema.parse(request.params);
  const call = await getCallDetails(requireAuthContext(request), callId);
  response.status(200).json({ success: true, data: { call } });
}

export const listCallsController: RequestHandler = controller(handleList);
export const callDetailsController: RequestHandler = controller(handleDetails);
