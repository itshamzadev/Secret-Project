import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { answerAiQuery } from "./ai.service.js";
import { aiQuerySchema } from "./ai.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

async function handleQuery(
  request: Request,
  response: Response,
): Promise<void> {
  requireAuthContext(request);
  const result = await answerAiQuery(aiQuerySchema.parse(request.body));
  response.status(200).json({ success: true, data: result });
}

export const aiQueryController: RequestHandler = controller(handleQuery);
