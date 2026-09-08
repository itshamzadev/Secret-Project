import type { StatusDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import type { AuthContext } from "../auth/auth.types.js";
import { ContactModel } from "../contacts/contact.model.js";
import { UserModel } from "../users/user.model.js";
import { StatusModel } from "./status.model.js";
import { toStatusDto } from "./status.dto.js";
import type { CreateStatusInput } from "./status.validation.js";

function statusError(code: string, message: string, statusCode: number): AppError {
  return new AppError({ code, message, statusCode });
}

function objectId(userId: string): Types.ObjectId {
  return new Types.ObjectId(userId);
}

export async function listStatuses(context: AuthContext): Promise<{ statuses: StatusDto[] }> {
  const owner = objectId(context.userId);
  await StatusModel.deleteMany({ expiresAt: { $lte: new Date() } }).exec();
  const contacts = await ContactModel.find({ ownerId: owner }).select({ contactUserId: 1 }).exec();
  const visibleOwnerIds = [owner, ...contacts.map((contact) => contact.contactUserId)];
  const statuses = await StatusModel.find({
    ownerId: { $in: visibleOwnerIds },
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(100)
    .exec();
  const owners = await UserModel.find({ _id: { $in: visibleOwnerIds }, accountStatus: "active" }).exec();
  const ownersById = new Map(owners.map((user) => [user._id.toString(), user]));
  return {
    statuses: statuses.flatMap((status) => {
      const user = ownersById.get(status.ownerId.toString());
      return user === undefined ? [] : [toStatusDto(status, user, context.userId)];
    }),
  };
}

export async function createStatus(context: AuthContext, input: CreateStatusInput): Promise<StatusDto> {
  const status = await StatusModel.create({
    ownerId: objectId(context.userId),
    text: input.text,
    viewedBy: [objectId(context.userId)],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const owner = await UserModel.findOne({ _id: status.ownerId, accountStatus: "active" }).exec();
  if (owner === null) throw statusError("STATUS_OWNER_NOT_FOUND", "Your account was not found.", 404);
  return toStatusDto(status, owner, context.userId);
}

export async function markStatusViewed(context: AuthContext, statusId: string): Promise<void> {
  const status = await StatusModel.findOne({ _id: objectId(statusId), expiresAt: { $gt: new Date() } }).exec();
  if (status === null) throw statusError("STATUS_NOT_FOUND", "The status was not found.", 404);
  const viewer = objectId(context.userId);
  const contact = await ContactModel.exists({ ownerId: viewer, contactUserId: status.ownerId });
  if (!status.ownerId.equals(viewer) && contact === null) {
    throw statusError("STATUS_NOT_FOUND", "The status was not found.", 404);
  }
  await StatusModel.updateOne({ _id: status._id }, { $addToSet: { viewedBy: viewer } }).exec();
}

export async function deleteStatus(context: AuthContext, statusId: string): Promise<void> {
  const result = await StatusModel.deleteOne({ _id: objectId(statusId), ownerId: objectId(context.userId) }).exec();
  if (result.deletedCount === 0) throw statusError("STATUS_NOT_FOUND", "The status was not found.", 404);
}

export async function initializeStatusModels(): Promise<void> {
  await StatusModel.init();
}
