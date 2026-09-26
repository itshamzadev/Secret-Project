import { model, Schema } from "mongoose";
import type { Types } from "mongoose";

export interface MessageUserStateEntity {
  messageId: Types.ObjectId;
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  hidden: boolean;
  favorite: boolean;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const messageUserStateSchema = new Schema<MessageUserStateEntity>(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      required: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    hidden: { type: Boolean, default: false },
    favorite: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
  },
  { collection: "message_user_states", timestamps: true, versionKey: false },
);

messageUserStateSchema.index({ messageId: 1, userId: 1 }, { unique: true });
messageUserStateSchema.index({ conversationId: 1, userId: 1, hidden: 1 });
messageUserStateSchema.index({ userId: 1, favorite: 1, updatedAt: -1 });
messageUserStateSchema.index({ userId: 1, pinned: 1, updatedAt: -1 });

export const MessageUserStateModel = model<MessageUserStateEntity>(
  "MessageUserState",
  messageUserStateSchema,
);
