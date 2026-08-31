import { model, Schema } from "mongoose";

import type { MessageEntity } from "./message.types.js";

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
      enum: ["text"],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
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

export const MessageModel = model<MessageEntity>("Message", messageSchema);
