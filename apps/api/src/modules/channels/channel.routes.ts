import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  createChannelController,
  createChannelPostController,
  followChannelController,
  listChannelPostsController,
  listChannelsController,
  unfollowChannelController,
} from "./channel.controller.js";

export function createChannelRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get("/", listChannelsController);
  router.post("/", createChannelController);
  router.get("/:channelId/posts", listChannelPostsController);
  router.post("/:channelId/posts", createChannelPostController);
  router.post("/:channelId/follow", followChannelController);
  router.delete("/:channelId/follow", unfollowChannelController);
  return router;
}
