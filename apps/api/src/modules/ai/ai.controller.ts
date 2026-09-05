import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { aiOrchestrator } from "./ai.service.js";
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
  const auth = requireAuthContext(request);
  const result = await aiOrchestrator.answer(
    aiQuerySchema.parse(request.body),
    {
      userId: auth.userId,
    },
  );
  response.status(200).json({ success: true, data: result });
}

async function handleModels(
  _request: Request,
  response: Response,
): Promise<void> {
  response
    .status(200)
    .json({ success: true, data: aiOrchestrator.listModels() });
}

async function handleStream(
  request: Request,
  response: Response,
): Promise<void> {
  const auth = requireAuthContext(request);
  const input = aiQuerySchema.parse(request.body);
  const abortController = new AbortController();
  const abort = (): void => {
    if (!response.writableEnded) abortController.abort();
  };
  response.once("close", abort);
  response.status(200);
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();

  try {
    const result = await aiOrchestrator.stream(
      input,
      { userId: auth.userId },
      {
        signal: abortController.signal,
        onChunk: (chunk) => {
          response.write(
            `data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`,
          );
        },
      },
    );
    response.write(
      `data: ${JSON.stringify({ type: "complete", data: result })}\n\n`,
    );
    response.end();
  } catch {
    if (!response.writableEnded) {
      response.write(
        `data: ${JSON.stringify({ type: "failed", message: "Terqivo AI could not complete that response." })}\n\n`,
      );
      response.end();
    }
    // The stream already carries a safe terminal event. Do not pass a second error
    // response through Express after its headers have been sent.
  } finally {
    response.off("close", abort);
  }
}

export const aiQueryController: RequestHandler = controller(handleQuery);
export const aiModelsController: RequestHandler = controller(handleModels);
export const aiStreamController: RequestHandler = controller(handleStream);
