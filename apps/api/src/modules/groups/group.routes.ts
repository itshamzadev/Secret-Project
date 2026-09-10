import express, { Router } from "express";

import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  createGroupController,
  deleteGroupController,
  groupAvatarDownloadController,
  groupAvatarUploadController,
  listGroupsController,
  updateGroupController,
} from "./group.controller.js";

export function createGroupRouter(): Router {
  const router = Router();
  router.use(authenticate);
  const avatarBody = express.raw({
    limit: `${env.MEDIA_MAX_FILE_SIZE_BYTES}b`,
    type: ["image/*", "application/octet-stream"],
  });
  router.get("/", listGroupsController);
  router.post("/", createGroupController);
  router.patch("/:groupId", updateGroupController);
  router.delete("/:groupId", deleteGroupController);
  router.post("/:groupId/avatar", avatarBody, groupAvatarUploadController);
  router.get("/:groupId/avatar", groupAvatarDownloadController);
  return router;
}
