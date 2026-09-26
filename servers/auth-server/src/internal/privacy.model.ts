import { model, Schema, type Model, type Types } from "mongoose";

export type PrivacyVisibility = "everyone" | "contacts" | "nobody";
export interface PrivacySettingsEntity {
  userId: Types.ObjectId;
  profilePhoto: PrivacyVisibility;
  lastSeen: PrivacyVisibility;
  readReceipts: boolean;
  messageRequests: "everyone" | "contacts";
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<PrivacySettingsEntity>({
  userId: { type: Schema.Types.ObjectId, required: true, unique: true },
  profilePhoto: { type: String, enum: ["everyone", "contacts", "nobody"], default: "everyone" },
  lastSeen: { type: String, enum: ["everyone", "contacts", "nobody"], default: "contacts" },
  readReceipts: { type: Boolean, default: true },
  messageRequests: { type: String, enum: ["everyone", "contacts"], default: "everyone" },
}, { collection: "privacy_settings", timestamps: true, versionKey: false });

export const PrivacySettingsModel = (model<PrivacySettingsEntity>("PrivacySettings", schema) as Model<PrivacySettingsEntity>);
