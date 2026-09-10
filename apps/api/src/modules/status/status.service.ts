import type { StatusDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import type { AuthContext } from "../auth/auth.types.js";
import { ContactModel } from "../contacts/contact.model.js";
import { mediaStorage } from "../media/media.storage.js";
import { UserModel } from "../users/user.model.js";
import { StatusModel } from "./status.model.js";
import { toStatusDto } from "./status.dto.js";
import type { StatusMediaEntity } from "./status.types.js";
import type { CreateStatusInput, StatusMediaUploadInput } from "./status.validation.js";

function statusError(code: string, message: string, statusCode: number): AppError {
  return new AppError({ code, message, statusCode });
}

function objectId(userId: string): Types.ObjectId {
  return new Types.ObjectId(userId);
}

export async function listStatuses(context: AuthContext): Promise<{ statuses: StatusDto[] }> {
  const owner = objectId(context.userId);
  await removeExpiredStatuses();
  const contacts = await ContactModel.find({ ownerId: owner }).select({ contactUserId: 1 }).exec();
  const visibleOwnerIds = [owner, ...contacts.map((contact) => contact.contactUserId)];
  const statuses = await StatusModel.find({
    ownerId: { $in: visibleOwnerIds },
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(100)
    .exec();
  const viewerIds = statuses.flatMap((status) => status.viewedBy);
  const owners = await UserModel.find({ _id: { $in: visibleOwnerIds }, accountStatus: "active" }).exec();
  const viewerUsers = await UserModel.find({ _id: { $in: viewerIds }, accountStatus: "active" }).exec();
  const ownersById = new Map(owners.map((user) => [user._id.toString(), user]));
  return {
    statuses: statuses.flatMap((status) => {
      const user = ownersById.get(status.ownerId.toString());
      return user === undefined ? [] : [toStatusDto(status, user, context.userId, viewerUsers)];
    }),
  };
}

export async function createStatus(context: AuthContext, input: CreateStatusInput): Promise<StatusDto> {
  const status = await StatusModel.create({
    ownerId: objectId(context.userId),
    type: "text",
    text: input.text,
    media: null,
    viewedBy: [objectId(context.userId)],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const owner = await UserModel.findOne({ _id: status.ownerId, accountStatus: "active" }).exec();
  if (owner === null) throw statusError("STATUS_OWNER_NOT_FOUND", "Your account was not found.", 404);
  return toStatusDto(status, owner, context.userId);
}

export async function createMediaStatus(
  context: AuthContext,
  input: StatusMediaUploadInput,
  media: StatusMediaEntity,
): Promise<StatusDto> {
  const status = await StatusModel.create({
    ownerId: objectId(context.userId),
    type: input.type,
    text: input.text,
    media,
    viewedBy: [objectId(context.userId)],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const owner = await UserModel.findOne({ _id: status.ownerId, accountStatus: "active" }).exec();
  if (owner === null) {
    await mediaStorage.remove(media.storageKey).catch(() => undefined);
    throw statusError("STATUS_OWNER_NOT_FOUND", "Your account was not found.", 404);
  }
  return toStatusDto(status, owner, context.userId);
}

export async function getVisibleStatus(context: AuthContext, statusId: string) {
  if (!Types.ObjectId.isValid(statusId)) {
    throw statusError("STATUS_NOT_FOUND", "The status was not found.", 404);
  }
  const status = await StatusModel.findOne({
    _id: new Types.ObjectId(statusId),
    expiresAt: { $gt: new Date() },
  }).exec();
  if (status === null) throw statusError("STATUS_NOT_FOUND", "The status was not found.", 404);
  const viewer = objectId(context.userId);
  if (!status.ownerId.equals(viewer) && await ContactModel.exists({ ownerId: viewer, contactUserId: status.ownerId }) === null) {
    throw statusError("STATUS_NOT_FOUND", "The status was not found.", 404);
  }
  return status;
}

export async function markStatusViewed(context: AuthContext, statusId: string): Promise<void> {
  const status = await getVisibleStatus(context, statusId);
  const viewer = objectId(context.userId);
  await StatusModel.updateOne({ _id: status._id }, { $addToSet: { viewedBy: viewer } }).exec();
}

export async function deleteStatus(context: AuthContext, statusId: string): Promise<void> {
  if (!Types.ObjectId.isValid(statusId)) throw statusError("STATUS_NOT_FOUND", "The status was not found.", 404);
  const status = await StatusModel.findOne({ _id: new Types.ObjectId(statusId), ownerId: objectId(context.userId) }).exec();
  if (status === null) throw statusError("STATUS_NOT_FOUND", "The status was not found.", 404);
  const result = await StatusModel.deleteOne({ _id: status._id, ownerId: objectId(context.userId) }).exec();
  if (result.deletedCount === 0) throw statusError("STATUS_NOT_FOUND", "The status was not found.", 404);
  if (status.media?.storageKey !== undefined) await mediaStorage.remove(status.media.storageKey).catch(() => undefined);
}

async function removeExpiredStatuses(): Promise<void> {
  const expired = await StatusModel.find({ expiresAt: { $lte: new Date() } }).select({ media: 1 }).exec();
  await Promise.all(expired.map((status) => status.media?.storageKey === undefined ? Promise.resolve() : mediaStorage.remove(status.media.storageKey).catch(() => undefined)));
  await StatusModel.deleteMany({ expiresAt: { $lte: new Date() } }).exec();
}

export async function initializeStatusModels(): Promise<void> {
  await StatusModel.init();
}
