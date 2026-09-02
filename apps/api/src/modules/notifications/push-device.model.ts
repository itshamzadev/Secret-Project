import { model, Schema } from "mongoose";

import { pushPlatforms } from "@terqivo/contracts";

import type { PushDeviceEntity } from "./push-device.types.js";

const pushDeviceSchema = new Schema<PushDeviceEntity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    pushToken: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 512,
    },
    platform: { type: String, enum: [...pushPlatforms], required: true },
    deviceId: { type: String, default: null, trim: true, maxlength: 128 },
    enabled: { type: Boolean, default: true },
  },
  { collection: "push_devices", timestamps: true, versionKey: false },
);

pushDeviceSchema.index({ userId: 1, enabled: 1 });

export const PushDeviceModel = model<PushDeviceEntity>(
  "PushDevice",
  pushDeviceSchema,
);
