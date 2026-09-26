import express, { Router } from "express";

import type { AuthClient } from "../../clients/auth.client.js";
import { createAuthenticate } from "../../middleware/authenticate.js";
import { type StatusService } from "./status.service.js";
import { createStatusControllers } from "./status.controller.js";

export function createStatusRouter(service: StatusService, auth: AuthClient, maxMediaSizeBytes: number): Router {
  const router = Router();
  const controllers = createStatusControllers(service);
  router.use(createAuthenticate(auth));
  router.get("/", controllers.list);
  router.post("/", controllers.create);
  router.post("/media", express.raw({ limit: `${maxMediaSizeBytes}b`, type: () => true }), controllers.createMedia);
  router.get("/:statusId/media", controllers.media);
  router.post("/:statusId/view", controllers.view);
  router.delete("/:statusId", controllers.remove);
  return router;
}
