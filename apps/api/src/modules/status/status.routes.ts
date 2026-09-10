import express from "express";
import { Router } from "express";

import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import { createMediaStatusController, createStatusController, deleteStatusController, listStatusesController, statusMediaDownloadController, viewStatusController } from "./status.controller.js";

export function createStatusRouter(): Router {
  const router = Router();
  router.use(authenticate);
  const statusMediaBody = express.raw({
    limit: `${env.MEDIA_MAX_FILE_SIZE_BYTES}b`,
    type: ["audio/*", "image/*", "video/*", "application/octet-stream"],
  });
  router.get("/", listStatusesController);
  router.post("/", createStatusController);
  router.post("/media", statusMediaBody, createMediaStatusController);
  router.get("/:statusId/media", statusMediaDownloadController);
  router.post("/:statusId/view", viewStatusController);
  router.delete("/:statusId", deleteStatusController);
  return router;
}
