import { clientPlatforms } from "@terqivo/contracts";
import { model, Schema } from "mongoose";

import type { UserPresenceSessionEntity } from "./user-presence-session.types.js";

const userPresenceSessionSchema = new Schema<UserPresenceSessionEntity>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    durationSeconds: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    deviceId: {
      type: String,
      default: null,
      maxlength: 128,
    },
    platform: {
      type: String,
      enum: [...clientPlatforms, null],
      default: null,
    },
  },
  {
    collection: "user_presence_sessions",
    timestamps: true,
    versionKey: false,
  },
);

userPresenceSessionSchema.index({ userId: 1, startedAt: -1 });
userPresenceSessionSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { endedAt: null },
  },
);

export const UserPresenceSessionModel = model<UserPresenceSessionEntity>(
  "UserPresenceSession",
  userPresenceSessionSchema,
);
