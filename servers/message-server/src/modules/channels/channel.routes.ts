import express, { Router } from "express";

import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  createChannelController,
  createChannelPostController,
  followChannelController,
  listChannelPostsController,
  listChannelsController,
  unfollowChannelController,
  updateChannelController,
  deleteChannelController,
  deleteChannelPostController,
  channelAvatarUploadController,
  channelAvatarDownloadController,
} from "./channel.controller.js";

export function createChannelRouter(): Router {
  const router = Router();
  router.use(authenticate);
  const avatarBody = express.raw({
    limit: `${env.MEDIA_MAX_FILE_SIZE_BYTES}b`,
    type: ["image/*", "application/octet-stream"],
  });
  router.get("/", listChannelsController);
  router.post("/", createChannelController);
  router.get("/:channelId/posts", listChannelPostsController);
  router.post("/:channelId/posts", createChannelPostController);
  router.delete("/:channelId/posts/:postId", deleteChannelPostController);
  router.post("/:channelId/follow", followChannelController);
  router.delete("/:channelId/follow", unfollowChannelController);
  router.patch("/:channelId", updateChannelController);
  router.delete("/:channelId", deleteChannelController);
  router.post("/:channelId/avatar", avatarBody, channelAvatarUploadController);
  router.get("/:channelId/avatar", channelAvatarDownloadController);
  return router;
}
