import type { HydratedDocument, Types } from "mongoose";

import type { PrivacySettingsDto, PrivacyVisibility } from "@terqivo/contracts";

export interface PrivacySettingsEntity {
  userId: Types.ObjectId;
  profilePhoto: PrivacyVisibility;
  lastSeen: PrivacyVisibility;
  readReceipts: boolean;
  messageRequests: "everyone" | "contacts";
  createdAt: Date;
  updatedAt: Date;
}

export type PrivacySettingsDocument = HydratedDocument<PrivacySettingsEntity>;
export type PrivacySettingsInput = Partial<
  Omit<PrivacySettingsDto, "updatedAt">
>;
