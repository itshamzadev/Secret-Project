import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { blockUser, unblockUser } from "./block.service.js";
import { blockUserParamsSchema } from "./block.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

async function handleBlock(
  request: Request,
  response: Response,
): Promise<void> {
  const { userId } = blockUserParamsSchema.parse(request.params);
  await blockUser(requireAuthContext(request), userId);
  response.status(200).json({ success: true, data: { blocked: true } });
}

async function handleUnblock(
  request: Request,
  response: Response,
): Promise<void> {
  const { userId } = blockUserParamsSchema.parse(request.params);
  const removed = await unblockUser(requireAuthContext(request), userId);
  response
    .status(200)
    .json({ success: true, data: { blocked: false, removed } });
}

export const blockUserController: RequestHandler = controller(handleBlock);
export const unblockUserController: RequestHandler = controller(handleUnblock);
