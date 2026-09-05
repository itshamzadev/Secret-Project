import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  conversationMessageParamsSchema,
  messageHistoryQuerySchema,
  messageReadSchema,
  messageIdParamsSchema,
  messageReactionSchema,
  messageTextSchema,
} from "./message.validation.js";
import {
  getMessageHistory,
  markConversationRead,
  sendTextMessage,
  updateMessageReaction,
} from "./message.service.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

const handleSend = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const context = requireAuthContext(request);
  const { conversationId } = conversationMessageParamsSchema.parse(
    request.params,
  );
  const result = await sendTextMessage(
    context,
    conversationId,
    messageTextSchema.parse(request.body),
  );
  response.status(result.duplicate ? 200 : 201).json({
    success: true,
    data: { message: result.message, duplicate: result.duplicate },
  });
};

const handleHistory = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { conversationId } = conversationMessageParamsSchema.parse(
    request.params,
  );
  const result = await getMessageHistory(
    requireAuthContext(request),
    conversationId,
    messageHistoryQuerySchema.parse(request.query),
  );
  response.status(200).json({ success: true, data: result });
};

const handleRead = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { conversationId } = conversationMessageParamsSchema.parse(
    request.params,
  );
  const result = await markConversationRead(
    requireAuthContext(request),
    conversationId,
    messageReadSchema.parse(request.body),
  );
  response.status(200).json({ success: true, data: { receipt: result } });
};

const handleReaction = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { messageId } = messageIdParamsSchema.parse(request.params);
  const message = await updateMessageReaction(
    requireAuthContext(request),
    messageId,
    messageReactionSchema.parse(request.body),
  );
  response.status(200).json({ success: true, data: { message } });
};

const handleRemoveReaction = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { messageId } = messageIdParamsSchema.parse(request.params);
  const message = await updateMessageReaction(
    requireAuthContext(request),
    messageId,
    null,
  );
  response.status(200).json({ success: true, data: { message } });
};

export const sendMessageController: RequestHandler = controller(handleSend);
export const messageHistoryController: RequestHandler =
  controller(handleHistory);
export const markReadController: RequestHandler = controller(handleRead);
export const updateReactionController: RequestHandler =
  controller(handleReaction);
export const removeReactionController: RequestHandler =
  controller(handleRemoveReaction);
