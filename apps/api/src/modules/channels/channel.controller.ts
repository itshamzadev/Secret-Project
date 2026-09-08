import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  createChannel,
  createChannelPost,
  followChannel,
  listChannelPosts,
  listChannels,
} from "./channel.service.js";
import { channelIdParamsSchema, createChannelPostSchema, createChannelSchema } from "./channel.validation.js";

function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

export const listChannelsController: RequestHandler = controller(async (request, response) => {
  response.status(200).json({ success: true, data: await listChannels(requireAuthContext(request)) });
});

export const createChannelController: RequestHandler = controller(async (request, response) => {
  const channel = await createChannel(requireAuthContext(request), createChannelSchema.parse(request.body));
  response.status(201).json({ success: true, data: { channel } });
});

export const followChannelController: RequestHandler = controller(async (request, response) => {
  const { channelId } = channelIdParamsSchema.parse(request.params);
  const channel = await followChannel(requireAuthContext(request), channelId, true);
  response.status(200).json({ success: true, data: { channel } });
});

export const unfollowChannelController: RequestHandler = controller(async (request, response) => {
  const { channelId } = channelIdParamsSchema.parse(request.params);
  const channel = await followChannel(requireAuthContext(request), channelId, false);
  response.status(200).json({ success: true, data: { channel } });
});

export const listChannelPostsController: RequestHandler = controller(async (request, response) => {
  const { channelId } = channelIdParamsSchema.parse(request.params);
  response.status(200).json({ success: true, data: await listChannelPosts(requireAuthContext(request), channelId) });
});

export const createChannelPostController: RequestHandler = controller(async (request, response) => {
  const { channelId } = channelIdParamsSchema.parse(request.params);
  const post = await createChannelPost(requireAuthContext(request), channelId, createChannelPostSchema.parse(request.body));
  response.status(201).json({ success: true, data: { post } });
});
