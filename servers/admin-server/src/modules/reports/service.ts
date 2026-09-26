import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { ReportModel } from "../../models/report.js";
import type { AdminServerConfig } from "../../config/env.js";
import { getUsersByIds } from "../../clients/auth.client.js";
import { validateReportTarget } from "../../clients/message.client.js";
import type { AdminReportListResponse, ReportDto } from "../admin/contracts.js";
import { toAdminReportDto, toReportDto } from "../admin/dto.js";
import type { CreateReportInput, ReportStatusInput } from "../admin/validation.js";

function reportError(code: string, message: string, statusCode: number): AppError { return new AppError({ code, message, statusCode }); }
function objectId(value: string): Types.ObjectId { return new Types.ObjectId(value); }

async function validateTarget(config: AdminServerConfig, userId: string, input: CreateReportInput): Promise<void> {
  const required = input.targetType === "user" ? input.targetUserId : input.targetType === "message" ? input.messageId : input.targetType === "group" ? input.groupId : input.channelId;
  if (required === undefined) throw reportError("REPORT_TARGET_REQUIRED", "A valid target must be selected for this report.", 400);
  if (input.targetUserId === userId) throw reportError("REPORT_SELF_NOT_ALLOWED", "You cannot report your own account.", 400);
  await validateReportTarget(config, { reporterId: userId, targetType: input.targetType, targetUserId: input.targetUserId, conversationId: input.conversationId, messageId: input.messageId, groupId: input.groupId, channelId: input.channelId });
}

export async function createReport(config: AdminServerConfig, userId: string, input: CreateReportInput): Promise<{ report: ReportDto; duplicate: boolean }> {
  await validateTarget(config, userId, input);
  const query = { reporterId: objectId(userId), targetType: input.targetType, targetUserId: input.targetUserId === undefined ? null : objectId(input.targetUserId), conversationId: input.conversationId === undefined ? null : objectId(input.conversationId), messageId: input.messageId === undefined ? null : objectId(input.messageId), groupId: input.groupId === undefined ? null : objectId(input.groupId), channelId: input.channelId === undefined ? null : objectId(input.channelId), status: "open" as const };
  const existing = await ReportModel.findOne(query).exec();
  if (existing !== null) return { report: toReportDto(existing), duplicate: true };
  const report = await ReportModel.create({ ...query, reason: input.reason, details: input.details?.trim() || null });
  return { report: toReportDto(report), duplicate: false };
}

export async function listReports(config: AdminServerConfig, status?: "open" | "resolved" | "dismissed"): Promise<AdminReportListResponse> {
  const reports = await ReportModel.find(status === undefined ? {} : { status }).sort({ createdAt: -1, _id: -1 }).limit(200).exec();
  const ids = [...new Set(reports.flatMap((report) => [report.reporterId.toString(), report.targetUserId?.toString() ?? ""]).filter(Boolean))].map((id) => new Types.ObjectId(id));
  const users = (await getUsersByIds(config, ids.map((id) => id.toString()))).data; const byId = new Map(users.map((user) => [user.id, user]));
  return { reports: reports.map((report) => toAdminReportDto(report, byId.get(report.reporterId.toString()), report.targetUserId === null ? undefined : byId.get(report.targetUserId.toString()))) };
}

export async function updateReport(config: AdminServerConfig, adminId: string, reportId: string, input: ReportStatusInput): Promise<AdminReportListResponse["reports"][number]> {
  const report = Types.ObjectId.isValid(reportId) ? await ReportModel.findById(reportId).exec() : null;
  if (report === null) throw reportError("REPORT_NOT_FOUND", "The report was not found.", 404);
  report.status = input.status;
  report.resolvedByAdminId = input.status === "open" ? null : objectId(adminId);
  report.resolvedAt = input.status === "open" ? null : new Date();
  await report.save();
  const ids = [report.reporterId, ...(report.targetUserId === null ? [] : [report.targetUserId])];
  const users = (await getUsersByIds(config, ids.map((id) => id.toString()))).data; const byId = new Map(users.map((user) => [user.id, user]));
  return toAdminReportDto(report, byId.get(report.reporterId.toString()), report.targetUserId === null ? undefined : byId.get(report.targetUserId.toString()));
}
