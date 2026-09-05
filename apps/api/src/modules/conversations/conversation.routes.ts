import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  createDirectConversationController,
  listConversationsController,
  clearConversationController,
  muteConversationController,
  setConversationUnreadController,
  unmuteConversationController,
} from "./conversation.controller.js";

export function createConversationRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/direct", createDirectConversationController);
  router.get("/", listConversationsController);
  router.post("/:conversationId/clear", clearConversationController);
  router.put("/:conversationId/mute", muteConversationController);
  router.delete("/:conversationId/mute", unmuteConversationController);
  router.put("/:conversationId/unread", setConversationUnreadController);
  return router;
}
