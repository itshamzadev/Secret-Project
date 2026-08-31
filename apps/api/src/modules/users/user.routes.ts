import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  mePresenceController,
  userPresenceController,
} from "./user.controller.js";

export function createUserRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get("/me/presence", mePresenceController);
  router.get("/:userId/presence", userPresenceController);
  return router;
}
