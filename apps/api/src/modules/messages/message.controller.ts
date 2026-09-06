import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  conversationMessageParamsSchema,
  messageHistoryQuerySchema,
  messageReadSchema,
  messageIdParamsSchema,
  messageReactionSchema,
  messageTextSchema,
  messageEditSchema,
  messagePinSchema,
  e2efeEncryptedMessageSchema,
  e2efeEncryptedMessageEditSchema,
} from "./message.validation.js";
import { editEncryptedMessage, sendEncryptedMessage } from "./encrypted-message.service.js";
import {
  deleteMessageForEveryone,
  deleteMessageForMe,
  editMessage,
  getMessageHistory,
  markConversationRead,
  sendTextMessage,
  setMessageFavorite,
  setMessagePin,
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

const handleEncryptedSend = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { conversationId } = conversationMessageParamsSchema.parse(
    request.params,
  );
  const result = await sendEncryptedMessage(
    requireAuthContext(request),
    conversationId,
    e2efeEncryptedMessageSchema.parse({
      ...request.body,
      conversationId,
    }),
  );
  response.status(result.duplicate ? 200 : 201).json({
    success: true,
    data: {
      message: result.message,
      envelopes: result.envelopes,
      duplicate: result.duplicate,
    },
  });
};

const handleEncryptedEdit = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { messageId } = messageIdParamsSchema.parse(request.params);
  const result = await editEncryptedMessage(
    requireAuthContext(request),
    messageId,
    e2efeEncryptedMessageEditSchema.parse({
      ...request.body,
      messageId,
    }),
  );
  response.status(result.duplicate ? 200 : 200).json({
    success: true,
    data: {
      message: result.message,
      envelopes: result.envelopes,
      duplicate: result.duplicate,
    },
  });
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

const handleEdit = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { messageId } = messageIdParamsSchema.parse(request.params);
  const message = await editMessage(
    requireAuthContext(request),
    messageId,
    messageEditSchema.parse(request.body).text,
  );
  response.status(200).json({ success: true, data: { message } });
};

const handleDeleteForMe = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { messageId } = messageIdParamsSchema.parse(request.params);
  const result = await deleteMessageForMe(
    requireAuthContext(request),
    messageId,
  );
  response.status(200).json({ success: true, data: result });
};

const handleDeleteForEveryone = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { messageId } = messageIdParamsSchema.parse(request.params);
  const message = await deleteMessageForEveryone(
    requireAuthContext(request),
    messageId,
  );
  response.status(200).json({ success: true, data: { message } });
};

const handleFavorite = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { messageId } = messageIdParamsSchema.parse(request.params);
  const state = await setMessageFavorite(
    requireAuthContext(request),
    messageId,
    true,
  );
  response.status(200).json({ success: true, data: { state } });
};

const handleUnfavorite = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { messageId } = messageIdParamsSchema.parse(request.params);
  const state = await setMessageFavorite(
    requireAuthContext(request),
    messageId,
    false,
  );
  response.status(200).json({ success: true, data: { state } });
};

const handlePin = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { messageId } = messageIdParamsSchema.parse(request.params);
  const { scope } = messagePinSchema.parse(request.body);
  const message = await setMessagePin(
    requireAuthContext(request),
    messageId,
    scope,
    true,
  );
  response.status(200).json({ success: true, data: { message } });
};

const handleUnpin = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { messageId } = messageIdParamsSchema.parse(request.params);
  const { scope } = messagePinSchema.parse(request.body);
  const message = await setMessagePin(
    requireAuthContext(request),
    messageId,
    scope,
    false,
  );
  response.status(200).json({ success: true, data: { message } });
};

export const sendMessageController: RequestHandler = controller(handleSend);
export const sendEncryptedMessageController: RequestHandler = controller(
  handleEncryptedSend,
);
export const editEncryptedMessageController: RequestHandler = controller(
  handleEncryptedEdit,
);
export const messageHistoryController: RequestHandler =
  controller(handleHistory);
export const markReadController: RequestHandler = controller(handleRead);
export const updateReactionController: RequestHandler =
  controller(handleReaction);
export const removeReactionController: RequestHandler =
  controller(handleRemoveReaction);
export const editMessageController: RequestHandler = controller(handleEdit);
export const deleteMessageForMeController: RequestHandler =
  controller(handleDeleteForMe);
export const deleteMessageForEveryoneController: RequestHandler = controller(
  handleDeleteForEveryone,
);
export const favoriteMessageController: RequestHandler =
  controller(handleFavorite);
export const unfavoriteMessageController: RequestHandler =
  controller(handleUnfavorite);
export const pinMessageController: RequestHandler = controller(handlePin);
export const unpinMessageController: RequestHandler = controller(handleUnpin);
