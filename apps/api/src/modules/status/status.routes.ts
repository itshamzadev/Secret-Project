import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { createStatusController, deleteStatusController, listStatusesController, viewStatusController } from "./status.controller.js";

export function createStatusRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get("/", listStatusesController);
  router.post("/", createStatusController);
  router.post("/:statusId/view", viewStatusController);
  router.delete("/:statusId", deleteStatusController);
  return router;
}
