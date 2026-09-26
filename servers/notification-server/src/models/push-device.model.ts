import { model, Schema, type HydratedDocument, type Types } from "mongoose";

export const pushPlatforms = ["android"] as const;
export type PushPlatform = (typeof pushPlatforms)[number];

export interface PushDeviceEntity {
  userId: Types.ObjectId;
  pushToken: string;
  platform: PushPlatform;
  deviceId: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PushDeviceDocument = HydratedDocument<PushDeviceEntity>;

const schema = new Schema<PushDeviceEntity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    pushToken: { type: String, required: true, unique: true, maxlength: 512, trim: true },
    platform: { type: String, enum: pushPlatforms, required: true },
    deviceId: { type: String, default: null, maxlength: 128, trim: true },
    enabled: { type: Boolean, default: true },
  },
  { collection: "push_devices", timestamps: true, versionKey: false },
);

schema.index({ userId: 1, enabled: 1 });

export const PushDeviceModel = model<PushDeviceEntity>("NotificationPushDevice", schema, "push_devices");
