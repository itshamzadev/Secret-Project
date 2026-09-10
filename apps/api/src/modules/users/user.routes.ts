import express, { Router } from "express";

import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  mePresenceController,
  userPresenceController,
  userAvatarDeleteController,
  userAvatarDownloadController,
  userAvatarUploadController,
} from "./user.controller.js";
import {
  getPrivacySettingsController,
  updatePrivacySettingsController,
} from "../privacy/privacy.controller.js";
import {
  blockUserController,
  unblockUserController,
} from "../privacy/block.controller.js";

export function createUserRouter(): Router {
  const router = Router();
  router.use(authenticate);
  const avatarBody = express.raw({
    limit: `${env.MEDIA_MAX_FILE_SIZE_BYTES}b`,
    type: ["image/*", "application/octet-stream"],
  });
  router.get("/me/privacy", getPrivacySettingsController);
  router.patch("/me/privacy", updatePrivacySettingsController);
  router.post("/me/avatar", avatarBody, userAvatarUploadController);
  router.delete("/me/avatar", userAvatarDeleteController);
  router.get("/:userId/avatar", userAvatarDownloadController);
  router.get("/me/presence", mePresenceController);
  router.get("/:userId/presence", userPresenceController);
  router.put("/:userId/block", blockUserController);
  router.delete("/:userId/block", unblockUserController);
  return router;
}
