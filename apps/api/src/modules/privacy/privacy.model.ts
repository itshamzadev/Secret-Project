import { model, Schema } from "mongoose";

import type { PrivacySettingsEntity } from "./privacy.types.js";

const privacySettingsSchema = new Schema<PrivacySettingsEntity>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    profilePhoto: {
      type: String,
      enum: ["everyone", "contacts", "nobody"],
      default: "everyone",
    },
    lastSeen: {
      type: String,
      enum: ["everyone", "contacts", "nobody"],
      default: "contacts",
    },
    readReceipts: { type: Boolean, default: true },
    messageRequests: {
      type: String,
      enum: ["everyone", "contacts"],
      default: "everyone",
    },
  },
  { collection: "privacy_settings", timestamps: true, versionKey: false },
);

export const PrivacySettingsModel = model<PrivacySettingsEntity>(
  "PrivacySettings",
  privacySettingsSchema,
);
