import type { Request, RequestHandler, Response } from "express";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { requireAuthContext } from "../../middleware/authenticate.js";
import { e2efeEncryptedMediaSchema } from "./message.validation.js";
import { sendEncryptedMediaMessage } from "./encrypted-message.service.js";
import { E2EFEStagedMediaModel } from "../e2efe/e2efe-staged-media.model.js";

export const encryptedMediaMessageController: RequestHandler = (request, response, next) => {
  void handle(request, response).catch(next);
};

async function handle(request: Request, response: Response): Promise<void> {
  const context = requireAuthContext(request);
  const conversationId = String(request.params.conversationId ?? "");
  const input = e2efeEncryptedMediaSchema.parse({ ...request.body, conversationId });
  const staged = await E2EFEStagedMediaModel.findOne({ conversationId: new Types.ObjectId(conversationId), uploaderId: new Types.ObjectId(context.userId), clientMessageId: input.clientMessageId }).exec();
  if (staged === null) throw new AppError({ code: "MEDIA_UPLOAD_NOT_FOUND", message: "The encrypted media upload was not found.", statusCode: 404 });
  if (staged.type !== input.type || staged.size !== input.media.size || staged.storageKey !== input.media.storageKey) throw new AppError({ code: "MEDIA_UPLOAD_MISMATCH", message: "The encrypted media upload does not match the message.", statusCode: 409 });
  const result = await sendEncryptedMediaMessage(context, conversationId, input);
  if (staged.attachedAt === null) { staged.attachedAt = new Date(); await staged.save(); }
  response.status(result.duplicate ? 200 : 201).json({ success: true, data: { message: result.message, envelopes: result.envelopes, duplicate: result.duplicate } });
}
