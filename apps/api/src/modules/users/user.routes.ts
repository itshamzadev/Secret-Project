import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  mePresenceController,
  userPresenceController,
} from "./user.controller.js";
import {
  blockUserController,
  unblockUserController,
} from "../privacy/block.controller.js";

export function createUserRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get("/me/presence", mePresenceController);
  router.get("/:userId/presence", userPresenceController);
  router.put("/:userId/block", blockUserController);
  router.delete("/:userId/block", unblockUserController);
  return router;
}
