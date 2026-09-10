import type { PrivacySettingsDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import type { AuthContext } from "../auth/auth.types.js";
import { PrivacySettingsModel } from "./privacy.model.js";
import type { UpdatePrivacySettingsInput } from "./privacy.validation.js";

const defaults = {
  profilePhoto: "everyone" as const,
  lastSeen: "contacts" as const,
  readReceipts: true,
  messageRequests: "everyone" as const,
};

function toDto(settings: {
  profilePhoto: PrivacySettingsDto["profilePhoto"];
  lastSeen: PrivacySettingsDto["lastSeen"];
  readReceipts: boolean;
  messageRequests: PrivacySettingsDto["messageRequests"];
  updatedAt: Date;
}): PrivacySettingsDto {
  return {
    profilePhoto: settings.profilePhoto,
    lastSeen: settings.lastSeen,
    readReceipts: settings.readReceipts,
    messageRequests: settings.messageRequests,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export async function getPrivacySettings(
  context: AuthContext,
): Promise<PrivacySettingsDto> {
  const settings = await PrivacySettingsModel.findOneAndUpdate(
    { userId: new Types.ObjectId(context.userId) },
    {
      $setOnInsert: { userId: new Types.ObjectId(context.userId), ...defaults },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();
  return toDto(settings);
}

export async function updatePrivacySettings(
  context: AuthContext,
  input: UpdatePrivacySettingsInput,
): Promise<PrivacySettingsDto> {
  const userId = new Types.ObjectId(context.userId);
  const existing = await PrivacySettingsModel.findOne({ userId }).exec();
  const insertValues = {
    userId,
    ...defaults,
    ...(input.profilePhoto === undefined
      ? {}
      : { profilePhoto: input.profilePhoto }),
    ...(input.lastSeen === undefined ? {} : { lastSeen: input.lastSeen }),
    ...(input.readReceipts === undefined
      ? {}
      : { readReceipts: input.readReceipts }),
    ...(input.messageRequests === undefined
      ? {}
      : { messageRequests: input.messageRequests }),
  };
  const settings = existing
    ? await PrivacySettingsModel.findOneAndUpdate(
        { userId },
        { $set: input },
        { returnDocument: "after", runValidators: true },
      ).exec()
    : await PrivacySettingsModel.create(insertValues);
  if (settings === null)
    throw new AppError({
      code: "PRIVACY_SETTINGS_UPDATE_FAILED",
      message: "Privacy settings could not be updated.",
      statusCode: 500,
    });
  return toDto(settings);
}

export async function initializePrivacyModels(): Promise<void> {
  await PrivacySettingsModel.init();
}
