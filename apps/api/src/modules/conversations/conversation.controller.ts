import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  conversationListQuerySchema,
  createDirectConversationSchema,
  conversationMuteSchema,
  conversationIdParamsSchema,
  conversationUnreadSchema,
} from "./conversation.validation.js";
import {
  createOrGetDirectConversation,
  listConversations,
  clearConversationForUser,
  setConversationMute,
  setConversationUnread,
} from "./conversation.service.js";
import { toConversationDto } from "./conversation.dto.js";
import { ContactModel } from "../contacts/contact.model.js";
import { UserModel } from "../users/user.model.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

const handleCreateDirect = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const context = requireAuthContext(request);
  const input = createDirectConversationSchema.parse(request.body);
  const conversation = await createOrGetDirectConversation(context, input);
  const otherId = conversation.participants.find(
    (participant) => participant.userId.toString() !== context.userId,
  )?.userId;
  if (otherId === undefined) {
    throw new Error("Direct conversation participant is missing");
  }
  const [user, contact] = await Promise.all([
    UserModel.findById(otherId).exec(),
    ContactModel.findOne({
      ownerId: context.userId,
      contactUserId: otherId,
    }).exec(),
  ]);
  if (user === null) {
    throw new Error("Direct conversation user is missing");
  }
  response.status(201).json({
    success: true,
    data: {
      conversation: toConversationDto(
        conversation,
        context.userId,
        user,
        contact,
        null,
      ),
    },
  });
};

const handleList = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const result = await listConversations(
    requireAuthContext(request),
    conversationListQuerySchema.parse(request.query),
  );
  response.status(200).json({ success: true, data: result });
};

const handleUnread = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { conversationId } = conversationIdParamsSchema.parse(request.params);
  const { unread } = conversationUnreadSchema.parse(request.body);
  await setConversationUnread(
    requireAuthContext(request),
    conversationId,
    unread,
  );
  response.status(200).json({ success: true, data: { unread } });
};

const handleClear = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { conversationId } = conversationIdParamsSchema.parse(request.params);
  await clearConversationForUser(requireAuthContext(request), conversationId);
  response.status(200).json({ success: true, data: { cleared: true } });
};

const handleMute = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { conversationId } = conversationIdParamsSchema.parse(request.params);
  const { duration } = conversationMuteSchema.parse(request.body);
  await setConversationMute(
    requireAuthContext(request),
    conversationId,
    duration,
  );
  response.status(200).json({ success: true, data: { muted: true, duration } });
};

const handleUnmute = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { conversationId } = conversationIdParamsSchema.parse(request.params);
  await setConversationMute(requireAuthContext(request), conversationId, null);
  response.status(200).json({ success: true, data: { muted: false } });
};

export const createDirectConversationController: RequestHandler =
  controller(handleCreateDirect);
export const listConversationsController: RequestHandler =
  controller(handleList);
export const setConversationUnreadController: RequestHandler =
  controller(handleUnread);
export const clearConversationController: RequestHandler =
  controller(handleClear);
export const muteConversationController: RequestHandler =
  controller(handleMute);
export const unmuteConversationController: RequestHandler =
  controller(handleUnmute);
