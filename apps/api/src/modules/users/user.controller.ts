import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { getOwnPresenceHistory } from "./presence.service.js";
import {
  presenceHistoryQuerySchema,
  presenceUserIdParamsSchema,
} from "./presence.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

const handlePresence = async (
  request: Request,
  response: Response,
  requestedUserId: string,
): Promise<void> => {
  const result = await getOwnPresenceHistory(
    requireAuthContext(request),
    requestedUserId,
    presenceHistoryQuerySchema.parse(request.query),
  );
  response.status(200).json({ success: true, data: result });
};

const handleMePresence = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const context = requireAuthContext(request);
  await handlePresence(request, response, context.userId);
};

const handleUserPresence = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { userId } = presenceUserIdParamsSchema.parse(request.params);
  await handlePresence(request, response, userId);
};

export const mePresenceController: RequestHandler =
  controller(handleMePresence);
export const userPresenceController: RequestHandler =
  controller(handleUserPresence);
