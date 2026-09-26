import express, { Router } from "express";

import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import { encryptedMediaUploadController, uploadMediaController, downloadMediaController } from "./media.controller.js";

export function createMediaRouter(): Router {
  const router = Router();
  const binaryBody = express.raw({ limit: `${env.MEDIA_MAX_FILE_SIZE_BYTES}b`, type: ["application/octet-stream", "application/pdf", "application/zip", "application/gzip", "text/plain", "audio/*", "image/*", "video/*"] });
  router.use(authenticate);
  router.post("/conversations/:conversationId/media/encrypted/upload", binaryBody, encryptedMediaUploadController);
  router.post("/conversations/:conversationId/media", binaryBody, uploadMediaController);
  router.get("/media/:storageKey", downloadMediaController);
  return router;
}
