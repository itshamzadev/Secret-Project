import { Types } from "mongoose";

import { AppError } from "./auth-core/contracts.js";
import { PrivacySettingsModel, type PrivacySettingsEntity } from "./privacy.model.js";

const defaults = { profilePhoto: "everyone" as const, lastSeen: "contacts" as const, readReceipts: true, messageRequests: "everyone" as const };
export interface PrivacySettingsDto { profilePhoto: "everyone" | "contacts" | "nobody"; lastSeen: "everyone" | "contacts" | "nobody"; readReceipts: boolean; messageRequests: "everyone" | "contacts"; updatedAt: string; }
export interface UpdatePrivacySettingsInput { profilePhoto?: PrivacySettingsDto["profilePhoto"] | undefined; lastSeen?: PrivacySettingsDto["lastSeen"] | undefined; readReceipts?: boolean | undefined; messageRequests?: PrivacySettingsDto["messageRequests"] | undefined; }

function toDto(settings: PrivacySettingsEntity): PrivacySettingsDto { return { profilePhoto: settings.profilePhoto, lastSeen: settings.lastSeen, readReceipts: settings.readReceipts, messageRequests: settings.messageRequests, updatedAt: settings.updatedAt.toISOString() }; }

export async function getPrivacySettings(userId: string): Promise<PrivacySettingsDto> {
  const objectId = new Types.ObjectId(userId);
  const settings = await PrivacySettingsModel.findOneAndUpdate({ userId: objectId }, { $setOnInsert: { userId: objectId, ...defaults } }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }).lean<PrivacySettingsEntity>().exec();
  return toDto(settings);
}

export async function updatePrivacySettings(userId: string, input: UpdatePrivacySettingsInput): Promise<PrivacySettingsDto> {
  const objectId = new Types.ObjectId(userId);
  const existing = await PrivacySettingsModel.findOne({ userId: objectId }).exec();
  const insertValues = {
    userId: objectId,
    ...defaults,
    ...(input.profilePhoto === undefined ? {} : { profilePhoto: input.profilePhoto }),
    ...(input.lastSeen === undefined ? {} : { lastSeen: input.lastSeen }),
    ...(input.readReceipts === undefined ? {} : { readReceipts: input.readReceipts }),
    ...(input.messageRequests === undefined ? {} : { messageRequests: input.messageRequests }),
  };
  const settings = existing === null
    ? await PrivacySettingsModel.create(insertValues)
    : await PrivacySettingsModel.findOneAndUpdate({ userId: objectId }, { $set: input }, { returnDocument: "after", runValidators: true }).exec();
  if (settings === null) throw new AppError({ code: "PRIVACY_SETTINGS_UPDATE_FAILED", message: "Privacy settings could not be updated.", statusCode: 500 });
  return toDto(settings);
}

export async function initializePrivacyModels(): Promise<void> { await PrivacySettingsModel.init(); }
