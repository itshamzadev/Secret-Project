import type { AdminReportDto, ReportDto } from "@terqivo/contracts";

import type { UserDocument } from "../users/user.types.js";
import type { ReportDocument } from "./report.types.js";

export function toReportDto(report: ReportDocument): ReportDto {
  return {
    id: report._id.toString(),
    targetType: report.targetType,
    conversationId: report.conversationId?.toString() ?? null,
    messageId: report.messageId?.toString() ?? null,
    groupId: report.groupId?.toString() ?? null,
    channelId: report.channelId?.toString() ?? null,
    reason: report.reason,
    details: report.details,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

function reportUser(user: UserDocument | undefined) {
  return user === undefined
    ? null
    : {
        id: user._id.toString(),
        username: user.username,
        displayName: user.displayName,
      };
}

export function toAdminReportDto(
  report: ReportDocument,
  reporter: UserDocument | undefined,
  targetUser: UserDocument | undefined,
): AdminReportDto {
  const dto = toReportDto(report);
  return {
    ...dto,
    reporter: reportUser(reporter) ?? {
      id: report.reporterId.toString(),
      username: "unknown",
      displayName: "Unknown user",
    },
    targetUser: reportUser(targetUser),
    resolvedByAdminId: report.resolvedByAdminId?.toString() ?? null,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
  };
}
