import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  callDetailsController,
  listCallsController,
} from "./call.controller.js";

export function createCallRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get("/", listCallsController);
  router.get("/:callId", callDetailsController);
  return router;
}
