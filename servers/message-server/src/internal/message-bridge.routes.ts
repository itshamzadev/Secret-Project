import { Router, type Request, type RequestHandler, type Response } from "express";

import { internalServiceGuard, mediaInternalServiceGuard } from "./service-auth.js";
import { AppError } from "../core/errors.js";
import { authenticate, requireAuthContext } from "../middleware/authenticate.js";
import { e2efeEncryptedMessageSchema, messageIdParamsSchema, messageReadSchema, messageTextSchema } from "../modules/messages/message.validation.js";
import { sendEncryptedMessage } from "../modules/messages/encrypted-message.service.js";
import { markConversationRead, markMessageDelivered, sendMediaMessage, sendTextMessage } from "../modules/messages/message.service.js";
import { getConversationParticipantIds, getOwnedConversation, getOtherParticipant } from "../modules/conversations/conversation.service.js";
import { MessageModel } from "../modules/messages/message.model.js";
import { E2EFEStagedMediaModel } from "../modules/e2efe/e2efe-staged-media.model.js";
import { Types } from "mongoose";
import { z } from "zod";

function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void handler(request, response).catch(next); };
}

export function createMessageBridgeRouter(): Router {
  const router = Router();
  router.use("/media", mediaInternalServiceGuard, authenticate);
  router.post("/media/authorize-conversation", controller(async (request, response) => {
    const conversationId = String(request.body?.conversationId ?? "");
    await getOwnedConversation(requireAuthContext(request), conversationId);
    response.status(200).json({ success: true, data: { authorized: true } });
  }));
  router.post("/media/send", controller(async (request, response) => {
    const conversationId = String(request.body?.conversationId ?? "");
    const input = z.object({ clientMessageId: z.string().min(1).max(128), type: z.enum(["image", "video", "audio", "file"]), media: z.record(z.string(), z.unknown()) }).parse(request.body);
    const result = await sendMediaMessage(requireAuthContext(request), conversationId, { clientMessageId: input.clientMessageId, type: input.type, media: input.media as unknown as Parameters<typeof sendMediaMessage>[2]["media"] });
    response.status(result.duplicate ? 200 : 201).json({ success: true, data: { message: result.message, duplicate: result.duplicate } });
  }));
  router.post("/media/authorize-download", controller(async (request, response) => {
    const storageKey = String(request.body?.storageKey ?? "");
    const message = await MessageModel.findOne({ "media.storageKey": storageKey }).exec();
    if (message === null || message.media === null) throw new AppError({ code: "MEDIA_NOT_FOUND", message: "The media file was not found.", statusCode: 404 });
    await getOwnedConversation(requireAuthContext(request), message.conversationId.toString());
    response.status(200).json({ success: true, data: message.media });
  }));
  router.post("/media/stage", controller(async (request, response) => {
    const input = z.object({ conversationId: z.string().min(1), clientMessageId: z.string().min(1).max(128), type: z.enum(["image", "video", "audio", "file"]), storageKey: z.string().regex(/^[a-f0-9-]+\.bin$/i), size: z.number().int().min(1).max(250 * 1024 * 1024) }).parse(request.body);
    const context = requireAuthContext(request);
    await getOwnedConversation(context, input.conversationId);
    const existing = await E2EFEStagedMediaModel.findOne({ uploaderId: new Types.ObjectId(context.userId), clientMessageId: input.clientMessageId }).exec();
    if (existing !== null) {
      if (existing.conversationId.toString() !== input.conversationId || existing.type !== input.type || existing.size !== input.size) throw new AppError({ code: "CLIENT_MESSAGE_ID_CONFLICT", message: "The client message identifier is already used elsewhere.", statusCode: 409 });
      response.status(200).json({ success: true, data: { storageKey: existing.storageKey, size: existing.size, duplicate: true } });
      return;
    }
    const staged = await E2EFEStagedMediaModel.create({ storageKey: input.storageKey, conversationId: new Types.ObjectId(input.conversationId), uploaderId: new Types.ObjectId(context.userId), clientMessageId: input.clientMessageId, type: input.type, size: input.size, attachedAt: null });
    response.status(201).json({ success: true, data: { storageKey: staged.storageKey, size: staged.size, duplicate: false } });
  }));
  router.use("/media", (_request, response) => response.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }));

  router.get("/users/:userId/participants", internalServiceGuard, controller(async (request, response) => {
    const participantIds = await getConversationParticipantIds(String(request.params.userId ?? ""));
    response.status(200).json({ success: true, data: { participantIds } });
  }));
  router.use(internalServiceGuard, authenticate);
  router.post("/messages/send", controller(async (request, response) => {
    const input = messageTextSchema.parse(request.body);
    const conversationId = String(request.body?.conversationId ?? "");
    const result = await sendTextMessage(requireAuthContext(request), conversationId, input);
    response.status(result.duplicate ? 200 : 201).json({ success: true, data: { message: result.message, duplicate: result.duplicate, recipientId: result.recipientId } });
  }));
  router.post("/messages/send-encrypted", controller(async (request, response) => {
    const input = e2efeEncryptedMessageSchema.parse(request.body);
    const result = await sendEncryptedMessage(requireAuthContext(request), input.conversationId, input);
    response.status(result.duplicate ? 200 : 201).json({ success: true, data: { message: result.message, envelopes: result.envelopes, duplicate: result.duplicate, recipientId: result.recipientId } });
  }));
  router.post("/messages/delivered", controller(async (request, response) => {
    const { messageId } = messageIdParamsSchema.parse(request.body);
    const receipt = await markMessageDelivered(requireAuthContext(request), messageId);
    response.status(200).json({ success: true, data: { receipt } });
  }));
  router.post("/conversations/read", controller(async (request, response) => {
    const input = messageReadSchema.parse(request.body);
    const conversationId = String(request.body?.conversationId ?? "");
    const receipt = await markConversationRead(requireAuthContext(request), conversationId, input);
    response.status(200).json({ success: true, data: { receipt } });
  }));
  router.post("/conversations/typing", controller(async (request, response) => {
    const conversationId = String(request.body?.conversationId ?? "");
    const conversation = await getOwnedConversation(requireAuthContext(request), conversationId);
    response.status(200).json({ success: true, data: { recipientId: getOtherParticipant(conversation, requireAuthContext(request).userId).toString() } });
  }));
  return router;
}
