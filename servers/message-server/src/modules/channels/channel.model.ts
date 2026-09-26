import { model, Schema } from "mongoose";

import type { ChannelEntity, ChannelPostEntity } from "./channel.types.js";

const channelSchema = new Schema<ChannelEntity>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    handle: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 30,
    },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    avatarUrl: { type: String, default: null, maxlength: 2048 },
    avatarStorageKey: { type: String, default: null, maxlength: 128 },
    avatarMimeType: { type: String, default: null, maxlength: 100 },
    badges: {
      type: [String],
      enum: ["verified", "terqivo"],
      default: [],
    },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    followerIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
  },
  { collection: "channels", timestamps: true, versionKey: false },
);

channelSchema.index({ handle: 1 }, { unique: true });
channelSchema.index({ updatedAt: -1 });

const channelPostSchema = new Schema<ChannelPostEntity>(
  {
    channelId: { type: Schema.Types.ObjectId, ref: "Channel", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { collection: "channel_posts", timestamps: true, versionKey: false },
);

channelPostSchema.index({ channelId: 1, createdAt: -1, _id: -1 });

export const ChannelModel = model<ChannelEntity>("Channel", channelSchema);
export const ChannelPostModel = model<ChannelPostEntity>(
  "ChannelPost",
  channelPostSchema,
);
