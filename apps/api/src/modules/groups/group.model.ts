import { model, Schema } from "mongoose";
import type { Types } from "mongoose";

import type { GroupEntity } from "./group.types.js";

const groupSchema = new Schema<GroupEntity>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      required: true,
      validate: {
        validator: (members: Types.ObjectId[]) => members.length >= 1 && members.length <= 100,
        message: "A group must have between one and one hundred members.",
      },
    },
  },
  { collection: "groups", timestamps: true, versionKey: false },
);

groupSchema.index({ memberIds: 1, updatedAt: -1 });
groupSchema.index({ ownerId: 1, createdAt: -1 });

export const GroupModel = model<GroupEntity>("Group", groupSchema);
