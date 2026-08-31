import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  createDirectConversationController,
  listConversationsController,
} from "./conversation.controller.js";

export function createConversationRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/direct", createDirectConversationController);
  router.get("/", listConversationsController);
  return router;
}
