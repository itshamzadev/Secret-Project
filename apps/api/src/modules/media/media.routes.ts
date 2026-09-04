import express, { Router } from "express";

import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  downloadMediaController,
  uploadMediaController,
} from "./media.controller.js";

const binaryMediaBody = express.raw({
  limit: `${env.MEDIA_MAX_FILE_SIZE_BYTES}b`,
  type: [
    "application/octet-stream",
    "application/pdf",
    "application/zip",
    "application/gzip",
    "text/plain",
    "audio/*",
    "image/*",
    "video/*",
  ],
});

export function createMediaRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/:conversationId/media", binaryMediaBody, uploadMediaController);
  return router;
}

export function createMediaFileRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get("/:storageKey", downloadMediaController);
  return router;
}
