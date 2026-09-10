import { pipeline } from "node:stream/promises";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Types } from "mongoose";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { AppError } from "../../core/errors.js";
import {
  openAvatar,
  removeAvatar,
  storeAvatar,
} from "../media/avatar.service.js";
import { ChannelModel } from "./channel.model.js";
import {
  createChannel,
  createChannelPost,
  deleteChannel,
  deleteChannelPost,
  followChannel,
  getOwnedChannel,
  listChannelPosts,
  listChannels,
  updateChannel,
} from "./channel.service.js";
import {
  channelIdParamsSchema,
  createChannelPostSchema,
  createChannelSchema,
  updateChannelSchema,
} from "./channel.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

export const listChannelsController: RequestHandler = controller(
  async (request, response) => {
    response.status(200).json({
      success: true,
      data: await listChannels(requireAuthContext(request)),
    });
  },
);

export const createChannelController: RequestHandler = controller(
  async (request, response) => {
    const channel = await createChannel(
      requireAuthContext(request),
      createChannelSchema.parse(request.body),
    );
    response.status(201).json({ success: true, data: { channel } });
  },
);

export const followChannelController: RequestHandler = controller(
  async (request, response) => {
    const { channelId } = channelIdParamsSchema.parse(request.params);
    const channel = await followChannel(
      requireAuthContext(request),
      channelId,
      true,
    );
    response.status(200).json({ success: true, data: { channel } });
  },
);

export const unfollowChannelController: RequestHandler = controller(
  async (request, response) => {
    const { channelId } = channelIdParamsSchema.parse(request.params);
    const channel = await followChannel(
      requireAuthContext(request),
      channelId,
      false,
    );
    response.status(200).json({ success: true, data: { channel } });
  },
);

export const listChannelPostsController: RequestHandler = controller(
  async (request, response) => {
    const { channelId } = channelIdParamsSchema.parse(request.params);
    response.status(200).json({
      success: true,
      data: await listChannelPosts(requireAuthContext(request), channelId),
    });
  },
);

export const createChannelPostController: RequestHandler = controller(
  async (request, response) => {
    const { channelId } = channelIdParamsSchema.parse(request.params);
    const post = await createChannelPost(
      requireAuthContext(request),
      channelId,
      createChannelPostSchema.parse(request.body),
    );
    response.status(201).json({ success: true, data: { post } });
  },
);

export const updateChannelController: RequestHandler = controller(
  async (request, response) => {
    const { channelId } = channelIdParamsSchema.parse(request.params);
    const channel = await updateChannel(
      requireAuthContext(request),
      channelId,
      updateChannelSchema.parse(request.body),
    );
    response.status(200).json({ success: true, data: { channel } });
  },
);

export const deleteChannelController: RequestHandler = controller(
  async (request, response) => {
    const { channelId } = channelIdParamsSchema.parse(request.params);
    await deleteChannel(requireAuthContext(request), channelId);
    response.status(200).json({ success: true, data: { deleted: true } });
  },
);

export const deleteChannelPostController: RequestHandler = controller(
  async (request, response) => {
    const { channelId } = channelIdParamsSchema.parse(request.params);
    const postId =
      typeof request.params.postId === "string" ? request.params.postId : "";
    await deleteChannelPost(requireAuthContext(request), channelId, postId);
    response.status(200).json({ success: true, data: { deleted: true } });
  },
);

export const channelAvatarUploadController: RequestHandler = controller(
  async (request, response) => {
    const context = requireAuthContext(request);
    const { channelId } = channelIdParamsSchema.parse(request.params);
    const channel = await getOwnedChannel(context, channelId);
    if (!Buffer.isBuffer(request.body) || request.body.length === 0)
      throw new AppError({
        code: "AVATAR_BODY_REQUIRED",
        message: "An avatar image is required.",
        statusCode: 400,
      });
    const avatar = await storeAvatar(request.body);
    const previousKey = channel.avatarStorageKey;
    try {
      channel.avatarStorageKey = avatar.storageKey;
      channel.avatarMimeType = avatar.mimeType;
      channel.avatarUrl = `/api/v1/channels/${channel._id.toString()}/avatar`;
      await channel.save();
      await removeAvatar(previousKey).catch(() => undefined);
    } catch (error: unknown) {
      await removeAvatar(avatar.storageKey).catch(() => undefined);
      throw error;
    }
    response
      .status(200)
      .json({ success: true, data: { avatarUrl: channel.avatarUrl } });
  },
);

export const channelAvatarDownloadController: RequestHandler = controller(
  async (request, response) => {
    const { channelId } = channelIdParamsSchema.parse(request.params);
    if (!Types.ObjectId.isValid(channelId))
      throw new AppError({
        code: "AVATAR_NOT_FOUND",
        message: "The avatar was not found.",
        statusCode: 404,
      });
    const channel = await ChannelModel.findById(
      new Types.ObjectId(channelId),
    ).exec();
    if (channel === null || channel.avatarStorageKey === null)
      throw new AppError({
        code: "AVATAR_NOT_FOUND",
        message: "The avatar was not found.",
        statusCode: 404,
      });
    const file = await openAvatar(channel.avatarStorageKey);
    if (file === null)
      throw new AppError({
        code: "AVATAR_NOT_FOUND",
        message: "The avatar was not found.",
        statusCode: 404,
      });
    response.setHeader("Content-Type", channel.avatarMimeType ?? "image/jpeg");
    response.setHeader("Content-Length", String(file.size));
    await pipeline(file.stream, response);
  },
);
