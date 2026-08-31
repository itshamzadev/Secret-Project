import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  conversationListQuerySchema,
  createDirectConversationSchema,
} from "./conversation.validation.js";
import {
  createOrGetDirectConversation,
  listConversations,
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

export const createDirectConversationController: RequestHandler =
  controller(handleCreateDirect);
export const listConversationsController: RequestHandler =
  controller(handleList);
