import { MessageModel } from "../messages/message.model.js";
import type { AuthContext } from "../auth/auth.types.js";
import { getOwnedConversation } from "../conversations/conversation.service.js";
import { AppError } from "../../core/errors.js";
import { Types } from "mongoose";
import { E2EFEStagedMediaModel } from "./e2efe-media-upload.model.js";
import type { E2EFEStagedMediaDocument } from "./e2efe-media-upload.types.js";

export async function getOwnedMediaMessage(
  context: AuthContext,
  storageKey: string,
) {
  const message = await MessageModel.findOne({
    "media.storageKey": storageKey,
  }).exec();
  if (message === null || message.media === null) {
    throw new AppError({
      code: "MEDIA_NOT_FOUND",
      message: "The media file was not found.",
      statusCode: 404,
    });
  }
  await getOwnedConversation(context, message.conversationId.toString());
  return message.media;
}

export async function getOwnedStagedE2EFEMedia(
  context: AuthContext,
  conversationId: string,
  clientMessageId: string,
): Promise<E2EFEStagedMediaDocument | null> {
  await getOwnedConversation(context, conversationId);
  return E2EFEStagedMediaModel.findOne({
    conversationId: new Types.ObjectId(conversationId),
    uploaderId: new Types.ObjectId(context.userId),
    clientMessageId,
  }).exec();
}

export async function createStagedE2EFEMedia(input: {
  storageKey: string;
  conversationId: string;
  uploaderId: string;
  clientMessageId: string;
  type: "image" | "video" | "audio" | "file";
  size: number;
}): Promise<E2EFEStagedMediaDocument> {
  return E2EFEStagedMediaModel.create({
    storageKey: input.storageKey,
    conversationId: new Types.ObjectId(input.conversationId),
    uploaderId: new Types.ObjectId(input.uploaderId),
    clientMessageId: input.clientMessageId,
    type: input.type,
    size: input.size,
    attachedAt: null,
  });
}

export async function markStagedE2EFEMediaAttached(
  staged: E2EFEStagedMediaDocument,
): Promise<void> {
  if (staged.attachedAt !== null) return;
  staged.attachedAt = new Date();
  await staged.save();
}

export async function initializeMediaModels(): Promise<void> {
  await E2EFEStagedMediaModel.init();
}
