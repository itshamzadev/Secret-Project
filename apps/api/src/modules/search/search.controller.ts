import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { searchWeb } from "./search.service.js";
import { webSearchQuerySchema } from "./search.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

async function handleSearch(
  request: Request,
  response: Response,
): Promise<void> {
  requireAuthContext(request);
  const result = await searchWeb(webSearchQuerySchema.parse(request.query));
  response.status(200).json({ success: true, data: result });
}

export const webSearchController: RequestHandler = controller(handleSearch);
