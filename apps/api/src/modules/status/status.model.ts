import { model, Schema } from "mongoose";

import type { StatusEntity } from "./status.types.js";

const statusSchema = new Schema<StatusEntity>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    viewedBy: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { collection: "statuses", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

statusSchema.index({ ownerId: 1, createdAt: -1 });
export const StatusModel = model<StatusEntity>("Status", statusSchema);
