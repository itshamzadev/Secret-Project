import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { createGroup, listGroups } from "./group.service.js";
import { createGroupSchema } from "./group.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

export const listGroupsController: RequestHandler = controller(async (request, response) => {
  const result = await listGroups(requireAuthContext(request));
  response.status(200).json({ success: true, data: result });
});

export const createGroupController: RequestHandler = controller(async (request, response) => {
  const group = await createGroup(requireAuthContext(request), createGroupSchema.parse(request.body));
  response.status(201).json({ success: true, data: { group } });
});
