import { pipeline } from "node:stream/promises";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  openAvatar,
  removeAvatar,
  storeAvatar,
} from "../media/avatar.service.js";
import {
  createGroup,
  deleteGroup,
  getOwnedGroup,
  listGroups,
  updateGroup,
} from "./group.service.js";
import {
  createGroupSchema,
  groupIdParamsSchema,
  updateGroupSchema,
} from "./group.validation.js";
import { GroupModel } from "./group.model.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

export const listGroupsController: RequestHandler = controller(
  async (request, response) => {
    const result = await listGroups(requireAuthContext(request));
    response.status(200).json({ success: true, data: result });
  },
);

export const createGroupController: RequestHandler = controller(
  async (request, response) => {
    const group = await createGroup(
      requireAuthContext(request),
      createGroupSchema.parse(request.body),
    );
    response.status(201).json({ success: true, data: { group } });
  },
);

export const updateGroupController: RequestHandler = controller(
  async (request, response) => {
    const { groupId } = groupIdParamsSchema.parse(request.params);
    const group = await updateGroup(
      requireAuthContext(request),
      groupId,
      updateGroupSchema.parse(request.body),
    );
    response.status(200).json({ success: true, data: { group } });
  },
);

export const deleteGroupController: RequestHandler = controller(
  async (request, response) => {
    const { groupId } = groupIdParamsSchema.parse(request.params);
    await deleteGroup(requireAuthContext(request), groupId);
    response.status(200).json({ success: true, data: { deleted: true } });
  },
);

export const groupAvatarUploadController: RequestHandler = controller(
  async (request, response) => {
    const context = requireAuthContext(request);
    const { groupId } = groupIdParamsSchema.parse(request.params);
    const group = await getOwnedGroup(context, groupId);
    if (!Buffer.isBuffer(request.body) || request.body.length === 0)
      throw new AppError({
        code: "AVATAR_BODY_REQUIRED",
        message: "An avatar image is required.",
        statusCode: 400,
      });
    const avatar = await storeAvatar(request.body);
    const previousKey = group.avatarStorageKey;
    try {
      group.avatarStorageKey = avatar.storageKey;
      group.avatarMimeType = avatar.mimeType;
      group.avatarUrl = `/api/v1/groups/${group._id.toString()}/avatar`;
      await group.save();
      await removeAvatar(previousKey).catch(() => undefined);
    } catch (error: unknown) {
      await removeAvatar(avatar.storageKey).catch(() => undefined);
      throw error;
    }
    response
      .status(200)
      .json({ success: true, data: { avatarUrl: group.avatarUrl } });
  },
);

export const groupAvatarDownloadController: RequestHandler = controller(
  async (request, response) => {
    const { groupId } = groupIdParamsSchema.parse(request.params);
    const context = requireAuthContext(request);
    if (!Types.ObjectId.isValid(groupId))
      throw new AppError({
        code: "AVATAR_NOT_FOUND",
        message: "The avatar was not found.",
        statusCode: 404,
      });
    const group = await GroupModel.findOne({
      _id: new Types.ObjectId(groupId),
      memberIds: new Types.ObjectId(context.userId),
    }).exec();
    if (group === null || group.avatarStorageKey === null)
      throw new AppError({
        code: "AVATAR_NOT_FOUND",
        message: "The avatar was not found.",
        statusCode: 404,
      });
    const file = await openAvatar(group.avatarStorageKey);
    if (file === null)
      throw new AppError({
        code: "AVATAR_NOT_FOUND",
        message: "The avatar was not found.",
        statusCode: 404,
      });
    response.setHeader("Content-Type", group.avatarMimeType ?? "image/jpeg");
    response.setHeader("Content-Length", String(file.size));
    await pipeline(file.stream, response);
  },
);
