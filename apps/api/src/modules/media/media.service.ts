import { MessageModel } from "../messages/message.model.js";
import type { AuthContext } from "../auth/auth.types.js";
import { getOwnedConversation } from "../conversations/conversation.service.js";
import { AppError } from "../../core/errors.js";

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
