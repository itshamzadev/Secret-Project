import { pipeline } from "node:stream/promises";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { requireAuthContext } from "../../middleware/authenticate.js";
import { ContactModel } from "../contacts/contact.model.js";
import {
  openAvatar,
  removeAvatar,
  storeAvatar,
} from "../media/avatar.service.js";
import { PrivacySettingsModel } from "../privacy/privacy.model.js";
import { getOwnPresenceHistory } from "./presence.service.js";
import { toSafeUserDto } from "./user.dto.js";
import { UserModel } from "./user.model.js";
import {
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
} from "./user.service.js";
import { updateUserProfileSchema } from "./user.validation.js";
import {
  getMongoDuplicateFields,
  isMongoDuplicateKeyError,
} from "../../utils/mongo.js";
import {
  presenceHistoryQuerySchema,
  presenceUserIdParamsSchema,
} from "./presence.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

const handlePresence = async (
  request: Request,
  response: Response,
  requestedUserId: string,
): Promise<void> => {
  const result = await getOwnPresenceHistory(
    requireAuthContext(request),
    requestedUserId,
    presenceHistoryQuerySchema.parse(request.query),
  );
  response.status(200).json({ success: true, data: result });
};

const handleMePresence = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const context = requireAuthContext(request);
  await handlePresence(request, response, context.userId);
};

const handleUserPresence = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { userId } = presenceUserIdParamsSchema.parse(request.params);
  await handlePresence(request, response, userId);
};

export const mePresenceController: RequestHandler =
  controller(handleMePresence);
export const userPresenceController: RequestHandler =
  controller(handleUserPresence);

async function handleProfileUpdate(
  request: Request,
  response: Response,
): Promise<void> {
  const context = requireAuthContext(request);
  const input = updateUserProfileSchema.parse(request.body);
  const user = await UserModel.findById(context.userId).exec();

  if (user === null) {
    throw new AppError({
      code: "USER_NOT_FOUND",
      message: "Your account was not found.",
      statusCode: 404,
    });
  }

  if (input.username !== undefined) {
    const usernameNormalized = normalizeUsername(input.username);
    const usernameConflict = await UserModel.exists({
      _id: { $ne: user._id },
      usernameNormalized,
    }).exec();
    if (usernameConflict !== null) {
      throw new AppError({
        code: "USERNAME_TAKEN",
        message: "That username is already in use.",
        statusCode: 409,
      });
    }
    user.username = input.username;
    user.usernameNormalized = usernameNormalized;
  }
  if (input.displayName !== undefined) user.displayName = input.displayName;
  if (input.bio !== undefined) user.bio = input.bio === "" ? null : input.bio;
  const nextEmail = input.email === undefined ? user.email : input.email;
  const nextPhone = input.phone === undefined ? user.phone : input.phone;
  if (nextEmail === null && nextPhone === null) {
    throw new AppError({
      code: "CONTACT_REQUIRED",
      message: "At least an email address or phone number is required.",
      statusCode: 400,
    });
  }
  if (input.email !== undefined) {
    const normalizedEmail = nextEmail === null ? null : normalizeEmail(nextEmail);
    user.email = normalizedEmail;
    user.emailNormalized = normalizedEmail;
  }
  if (input.phone !== undefined) {
    const normalizedPhone = nextPhone === null ? null : normalizePhone(nextPhone);
    user.phone = normalizedPhone;
    user.phoneNormalized = normalizedPhone;
  }
  if (input.accountType !== undefined) user.accountType = input.accountType;

  try {
    await user.save();
  } catch (error: unknown) {
    if (isMongoDuplicateKeyError(error)) {
      const duplicateFields = getMongoDuplicateFields(error);
      const code = duplicateFields.includes("emailNormalized")
        ? "EMAIL_TAKEN"
        : duplicateFields.includes("phoneNormalized")
          ? "PHONE_TAKEN"
          : "USERNAME_TAKEN";
      const message =
        code === "EMAIL_TAKEN"
          ? "That email address is already in use."
          : code === "PHONE_TAKEN"
            ? "That phone number is already in use."
            : "That username is already in use.";
      throw new AppError({
        code,
        message,
        statusCode: 409,
      });
    }
    throw error;
  }

  response.status(200).json({
    success: true,
    data: { user: toSafeUserDto(user) },
  });
}

export const userProfileUpdateController: RequestHandler =
  controller(handleProfileUpdate);

async function handleAvatarUpload(
  request: Request,
  response: Response,
): Promise<void> {
  const context = requireAuthContext(request);
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
    throw new AppError({
      code: "AVATAR_BODY_REQUIRED",
      message: "An avatar image is required.",
      statusCode: 400,
    });
  }
  const user = await UserModel.findById(context.userId).exec();
  if (user === null)
    throw new AppError({
      code: "USER_NOT_FOUND",
      message: "Your account was not found.",
      statusCode: 404,
    });
  const avatar = await storeAvatar(request.body);
  const previousKey = user.avatarStorageKey;
  try {
    user.avatarStorageKey = avatar.storageKey;
    user.avatarMimeType = avatar.mimeType;
    user.avatarUrl = `/api/v1/users/${user._id.toString()}/avatar`;
    await user.save();
    await removeAvatar(previousKey).catch(() => undefined);
  } catch (error: unknown) {
    await removeAvatar(avatar.storageKey).catch(() => undefined);
    throw error;
  }
  response
    .status(200)
    .json({ success: true, data: { user: toSafeUserDto(user) } });
}

async function handleAvatarDelete(
  request: Request,
  response: Response,
): Promise<void> {
  const context = requireAuthContext(request);
  const user = await UserModel.findById(context.userId).exec();
  if (user === null)
    throw new AppError({
      code: "USER_NOT_FOUND",
      message: "Your account was not found.",
      statusCode: 404,
    });
  const previousKey = user.avatarStorageKey;
  user.avatarStorageKey = null;
  user.avatarMimeType = null;
  user.avatarUrl = null;
  await user.save();
  await removeAvatar(previousKey).catch(() => undefined);
  response
    .status(200)
    .json({ success: true, data: { user: toSafeUserDto(user) } });
}

async function handleAvatarDownload(
  request: Request,
  response: Response,
): Promise<void> {
  const userId = request.params.userId;
  if (typeof userId !== "string" || !Types.ObjectId.isValid(userId)) {
    throw new AppError({
      code: "USER_NOT_FOUND",
      message: "The user was not found.",
      statusCode: 404,
    });
  }
  const user = await UserModel.findOne({ _id: userId, accountStatus: "active" })
    .select({ avatarStorageKey: 1, avatarMimeType: 1 })
    .exec();
  if (user === null || user.avatarStorageKey === null) {
    throw new AppError({
      code: "AVATAR_NOT_FOUND",
      message: "The avatar was not found.",
      statusCode: 404,
    });
  }
  const viewerId = requireAuthContext(request).userId;
  if (viewerId !== userId) {
    const privacy = await PrivacySettingsModel.findOne({ userId })
      .select({ profilePhoto: 1 })
      .exec();
    if (
      privacy?.profilePhoto === "nobody" ||
      (privacy?.profilePhoto === "contacts" &&
        (await ContactModel.exists({
          ownerId: viewerId,
          contactUserId: userId,
        }).exec()) === null)
    ) {
      throw new AppError({
        code: "AVATAR_NOT_FOUND",
        message: "The avatar was not found.",
        statusCode: 404,
      });
    }
  }
  const file = await openAvatar(user.avatarStorageKey);
  if (file === null)
    throw new AppError({
      code: "AVATAR_NOT_FOUND",
      message: "The avatar was not found.",
      statusCode: 404,
    });
  response.setHeader("Content-Type", user.avatarMimeType ?? "image/jpeg");
  response.setHeader("Content-Length", String(file.size));
  response.setHeader("Cache-Control", "private, max-age=300");
  await pipeline(file.stream, response);
}

export const userAvatarUploadController: RequestHandler =
  controller(handleAvatarUpload);
export const userAvatarDeleteController: RequestHandler =
  controller(handleAvatarDelete);
export const userAvatarDownloadController: RequestHandler =
  controller(handleAvatarDownload);
