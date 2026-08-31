import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  markReadController,
  messageHistoryController,
  sendMessageController,
} from "./message.controller.js";

export function createMessageRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/:conversationId/messages", sendMessageController);
  router.get("/:conversationId/messages", messageHistoryController);
  router.post("/:conversationId/read", markReadController);
  return router;
}
