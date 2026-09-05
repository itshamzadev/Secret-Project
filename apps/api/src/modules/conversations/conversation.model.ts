import { model, Schema } from "mongoose";

import type {
  ConversationEntity,
  ConversationParticipant,
} from "./conversation.types.js";

const participantSchema = new Schema<ConversationParticipant>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    lastDeliveredMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastDeliveredSequence: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastDeliveredAt: {
      type: Date,
      default: null,
    },
    lastReadMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastReadSequence: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastReadAt: {
      type: Date,
      default: null,
    },
    unreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    mutedUntil: { type: Date, default: null },
    muted: { type: Boolean, default: false },
    manualUnread: { type: Boolean, default: false },
    clearedAt: { type: Date, default: null },
  },
  { _id: false },
);

const conversationSchema = new Schema<ConversationEntity>(
  {
    type: {
      type: String,
      enum: ["direct"],
      default: "direct",
      required: true,
    },
    directKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
      validate: {
        validator: (participants: ConversationParticipant[]) =>
          participants.length === 2,
        message: "A direct conversation must have two participants.",
      },
    },
    messageSequence: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "conversations",
    timestamps: true,
    versionKey: false,
  },
);

conversationSchema.index({ "participants.userId": 1, lastMessageAt: -1 });

export const ConversationModel = model<ConversationEntity>(
  "Conversation",
  conversationSchema,
);
