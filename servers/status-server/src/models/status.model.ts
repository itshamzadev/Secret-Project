import { model, Schema } from "mongoose";

import type { StatusEntity } from "./status.types.js";

const statusSchema = new Schema<StatusEntity>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["text", "image", "video", "audio"], default: "text" },
    text: { type: String, default: "", trim: true, maxlength: 500 },
    media: {
      _id: false,
      storageKey: { type: String, default: null, maxlength: 128 },
      mimeType: { type: String, default: null, maxlength: 100 },
      size: { type: Number, default: null, min: 1 },
      width: { type: Number, default: null, min: 1 },
      height: { type: Number, default: null, min: 1 },
      durationSeconds: { type: Number, default: null, min: 0 },
    },
    viewedBy: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { collection: "statuses", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

statusSchema.index({ ownerId: 1, createdAt: -1 });
statusSchema.index({ ownerId: 1, expiresAt: 1, createdAt: -1 });
statusSchema.index({ expiresAt: 1 });

export const StatusModel = model<StatusEntity>("Status", statusSchema);
