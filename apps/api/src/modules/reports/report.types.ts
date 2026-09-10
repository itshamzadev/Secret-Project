import type { HydratedDocument, Types } from "mongoose";

import type {
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "@terqivo/contracts";

export interface ReportEntity {
  reporterId: Types.ObjectId;
  targetUserId: Types.ObjectId | null;
  targetType: ReportTargetType;
  conversationId: Types.ObjectId | null;
  messageId: Types.ObjectId | null;
  groupId: Types.ObjectId | null;
  channelId: Types.ObjectId | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolvedByAdminId: Types.ObjectId | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReportDocument = HydratedDocument<ReportEntity>;
