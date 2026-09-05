import { model, Schema } from "mongoose";

import type { UserBlockEntity } from "./block.types.js";

const blockSchema = new Schema<UserBlockEntity>(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    blockedUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { collection: "user_blocks", timestamps: true, versionKey: false },
);

blockSchema.index({ blockerId: 1, blockedUserId: 1 }, { unique: true });
blockSchema.index({ blockedUserId: 1 });

export const UserBlockModel = model<UserBlockEntity>("UserBlock", blockSchema);
