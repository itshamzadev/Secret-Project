import { model, Schema } from "mongoose";

import type { ReportEntity } from "./report.types.js";

const reportSchema = new Schema<ReportEntity>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    targetType: {
      type: String,
      enum: ["user", "message", "group", "channel"],
      required: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },
    messageId: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", default: null },
    channelId: { type: Schema.Types.ObjectId, ref: "Channel", default: null },
    reason: {
      type: String,
      enum: ["spam", "harassment", "abuse", "impersonation", "other"],
      required: true,
    },
    details: { type: String, default: null, maxlength: 1000 },
    status: {
      type: String,
      enum: ["open", "resolved", "dismissed"],
      default: "open",
      required: true,
    },
    resolvedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "AdminUser",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
  },
  { collection: "reports", timestamps: true, versionKey: false },
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, createdAt: -1 });
reportSchema.index({ targetUserId: 1, createdAt: -1 });

export const ReportModel = model<ReportEntity>("Report", reportSchema);
