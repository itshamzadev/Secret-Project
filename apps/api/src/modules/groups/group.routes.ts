import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { createGroupController, listGroupsController } from "./group.controller.js";

export function createGroupRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get("/", listGroupsController);
  router.post("/", createGroupController);
  return router;
}
