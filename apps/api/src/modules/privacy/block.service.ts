import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { isMongoDuplicateKeyError } from "../../utils/mongo.js";
import type { AuthContext } from "../auth/auth.types.js";
import { UserModel } from "../users/user.model.js";
import { UserBlockModel } from "./block.model.js";

function interactionBlocked(): AppError {
  return new AppError({
    code: "INTERACTION_BLOCKED",
    message: "This interaction is unavailable.",
    statusCode: 403,
  });
}

export async function isUserBlockedEitherDirection(
  firstUserId: string,
  secondUserId: string,
): Promise<boolean> {
  if (
    !Types.ObjectId.isValid(firstUserId) ||
    !Types.ObjectId.isValid(secondUserId)
  ) {
    return false;
  }
  return (
    (await UserBlockModel.exists({
      $or: [
        { blockerId: firstUserId, blockedUserId: secondUserId },
        { blockerId: secondUserId, blockedUserId: firstUserId },
      ],
    }).exec()) !== null
  );
}

export async function assertUsersCanInteract(
  firstUserId: string,
  secondUserId: string,
): Promise<void> {
  if (await isUserBlockedEitherDirection(firstUserId, secondUserId)) {
    throw interactionBlocked();
  }
}

export async function blockUser(
  context: AuthContext,
  blockedUserId: string,
): Promise<void> {
  if (context.userId === blockedUserId) {
    throw new AppError({
      code: "CANNOT_BLOCK_SELF",
      message: "You cannot block yourself.",
      statusCode: 400,
    });
  }
  const user = await UserModel.findOne({
    _id: blockedUserId,
    accountStatus: "active",
  })
    .select({ _id: 1 })
    .exec();
  if (user === null) throw interactionBlocked();
  try {
    await UserBlockModel.create({
      blockerId: new Types.ObjectId(context.userId),
      blockedUserId: new Types.ObjectId(blockedUserId),
    });
  } catch (error: unknown) {
    if (!isMongoDuplicateKeyError(error)) throw error;
  }
}

export async function unblockUser(
  context: AuthContext,
  blockedUserId: string,
): Promise<boolean> {
  const result = await UserBlockModel.deleteOne({
    blockerId: new Types.ObjectId(context.userId),
    blockedUserId: new Types.ObjectId(blockedUserId),
  }).exec();
  return result.deletedCount > 0;
}

export async function initializeBlockModels(): Promise<void> {
  await UserBlockModel.init();
}
