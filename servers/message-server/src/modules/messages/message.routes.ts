import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  markReadController,
  messageHistoryController,
  sendMessageController,
  sendEncryptedMessageController,
  editEncryptedMessageController,
  removeReactionController,
  updateReactionController,
  deleteMessageForEveryoneController,
  deleteMessageForMeController,
  editMessageController,
  favoriteMessageController,
  pinMessageController,
  unfavoriteMessageController,
  unpinMessageController,
} from "./message.controller.js";
import { encryptedMediaMessageController } from "./encrypted-media.controller.js";

export function createMessageRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/:conversationId/messages", sendMessageController);
  router.post(
    "/:conversationId/messages/encrypted",
    sendEncryptedMessageController,
  );
  router.post(
    "/:conversationId/messages/encrypted-media",
    encryptedMediaMessageController,
  );
  router.get("/:conversationId/messages", messageHistoryController);
  router.post("/:conversationId/read", markReadController);
  return router;
}

export function createMessageActionRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.put("/:messageId/reaction", updateReactionController);
  router.delete("/:messageId/reaction", removeReactionController);
  router.patch("/:messageId/encrypted", editEncryptedMessageController);
  router.patch("/:messageId", editMessageController);
  router.delete("/:messageId/for-me", deleteMessageForMeController);
  router.delete("/:messageId/for-everyone", deleteMessageForEveryoneController);
  router.put("/:messageId/favorite", favoriteMessageController);
  router.delete("/:messageId/favorite", unfavoriteMessageController);
  router.put("/:messageId/pin", pinMessageController);
  router.delete("/:messageId/pin", unpinMessageController);
  return router;
}
