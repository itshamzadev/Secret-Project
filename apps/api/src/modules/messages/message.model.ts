import { model, Schema } from "mongoose";

import type { MessageEntity } from "./message.types.js";

const reactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    emoji: {
      type: String,
      enum: ["❤️", "😂", "😮", "😢", "👍", "🙏"],
      required: true,
    },
    reactedAt: { type: Date, required: true },
  },
  { _id: false },
);

const mediaSchema = new Schema(
  {
    url: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationSeconds: { type: Number, default: null },
    thumbnailUrl: { type: String, default: null },
    fileName: { type: String, default: null },
    encrypted: { type: Boolean, default: false },
    encryptionVersion: { type: String, default: null },
  },
  { _id: false },
);

const messageSchema = new Schema<MessageEntity>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientMessageId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    type: {
      type: String,
      enum: ["text", "image", "video", "audio", "file"],
      required: true,
    },
    text: {
      type: String,
      required: false,
      trim: true,
      default: null,
      maxlength: 4000,
    },
    e2efeVersion: {
      type: String,
      enum: ["terqivo-e2efe-v1", null],
      default: null,
    },
    senderDeviceId: { type: Number, min: 1, max: 127, default: null },
    e2efeRevisionId: { type: String, default: null, maxlength: 128 },
    media: { type: mediaSchema, default: null },
    reactions: { type: [reactionSchema], default: [] },
    editedAt: { type: Date, default: null },
    deletedForEveryoneAt: { type: Date, default: null },
    deletedForEveryoneBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    pinnedForEveryoneAt: { type: Date, default: null },
    pinnedForEveryoneBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    replyToMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    sequence: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  {
    collection: "messages",
    timestamps: true,
    versionKey: false,
  },
);

messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ senderId: 1, clientMessageId: 1 }, { unique: true });
messageSchema.index({ conversationId: 1, sequence: 1 }, { unique: true });
messageSchema.index({ "media.storageKey": 1 }, { sparse: true });

export const MessageModel = model<MessageEntity>("Message", messageSchema);
