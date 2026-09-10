import type { AdminReportListResponse, ReportDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import type { AdminAuthContext } from "../admin/admin-user.types.js";
import type { AuthContext } from "../auth/auth.types.js";
import {
  getOwnedConversation,
  getOtherParticipant,
} from "../conversations/conversation.service.js";
import { MessageModel } from "../messages/message.model.js";
import { UserModel } from "../users/user.model.js";
import { ChannelModel } from "../channels/channel.model.js";
import { GroupModel } from "../groups/group.model.js";
import { toAdminReportDto, toReportDto } from "./report.dto.js";
import { ReportModel } from "./report.model.js";
import type {
  CreateReportInput,
  ReportStatusInput,
} from "./report.validation.js";

function reportError(
  code: string,
  message: string,
  statusCode: number,
): AppError {
  return new AppError({ code, message, statusCode });
}

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

async function validateTarget(
  context: AuthContext,
  input: CreateReportInput,
): Promise<void> {
  const targetUserId = input.targetUserId;
  const requiredTargetId =
    input.targetType === "user"
      ? targetUserId
      : input.targetType === "message"
        ? input.messageId
        : input.targetType === "group"
          ? input.groupId
          : input.channelId;
  if (requiredTargetId === undefined) {
    throw reportError(
      "REPORT_TARGET_REQUIRED",
      "A valid target must be selected for this report.",
      400,
    );
  }
  if (targetUserId !== undefined) {
    if (targetUserId === context.userId)
      throw reportError(
        "REPORT_SELF_NOT_ALLOWED",
        "You cannot report your own account.",
        400,
      );
    const target = await UserModel.exists({
      _id: objectId(targetUserId),
      accountStatus: "active",
    }).exec();
    if (target === null)
      throw reportError(
        "REPORT_TARGET_NOT_FOUND",
        "The reported user was not found.",
        404,
      );
  }
  if (input.conversationId !== undefined) {
    const conversation = await getOwnedConversation(
      context,
      input.conversationId,
    );
    if (
      targetUserId !== undefined &&
      !getOtherParticipant(conversation, context.userId).equals(
        objectId(targetUserId),
      )
    ) {
      throw reportError(
        "REPORT_TARGET_NOT_IN_CONVERSATION",
        "The reported user is not part of this conversation.",
        400,
      );
    }
  }
  if (input.messageId !== undefined) {
    const message = await MessageModel.findOne({
      _id: objectId(input.messageId),
      ...(input.conversationId === undefined
        ? {}
        : { conversationId: objectId(input.conversationId) }),
    })
      .select({ conversationId: 1 })
      .exec();
    if (message === null)
      throw reportError(
        "REPORT_TARGET_NOT_FOUND",
        "The reported message was not found.",
        404,
      );
    if (input.conversationId === undefined)
      await getOwnedConversation(context, message.conversationId.toString());
  }
  if (input.groupId !== undefined) {
    const group = await GroupModel.exists({
      _id: objectId(input.groupId),
      memberIds: objectId(context.userId),
    }).exec();
    if (group === null)
      throw reportError(
        "REPORT_TARGET_NOT_FOUND",
        "The reported group was not found.",
        404,
      );
  }
  if (input.channelId !== undefined) {
    const channel = await ChannelModel.exists({
      _id: objectId(input.channelId),
    }).exec();
    if (channel === null)
      throw reportError(
        "REPORT_TARGET_NOT_FOUND",
        "The reported channel was not found.",
        404,
      );
  }
}

export async function createReport(
  context: AuthContext,
  input: CreateReportInput,
): Promise<{ report: ReportDto; duplicate: boolean }> {
  await validateTarget(context, input);
  const query = {
    reporterId: objectId(context.userId),
    targetType: input.targetType,
    targetUserId:
      input.targetUserId === undefined ? null : objectId(input.targetUserId),
    conversationId:
      input.conversationId === undefined
        ? null
        : objectId(input.conversationId),
    messageId: input.messageId === undefined ? null : objectId(input.messageId),
    groupId: input.groupId === undefined ? null : objectId(input.groupId),
    channelId: input.channelId === undefined ? null : objectId(input.channelId),
    status: "open" as const,
  };
  const existing = await ReportModel.findOne(query).exec();
  if (existing !== null)
    return { report: toReportDto(existing), duplicate: true };
  const report = await ReportModel.create({
    ...query,
    reason: input.reason,
    details: input.details?.trim() || null,
  });
  return { report: toReportDto(report), duplicate: false };
}

export async function listAdminReports(
  status?: "open" | "resolved" | "dismissed",
): Promise<AdminReportListResponse> {
  const query = status === undefined ? {} : { status };
  const reports = await ReportModel.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(200)
    .exec();
  const userIds = [
    ...new Set(
      reports
        .flatMap((report) => [
          report.reporterId.toString(),
          report.targetUserId?.toString() ?? "",
        ])
        .filter(Boolean),
    ),
  ];
  const users = await UserModel.find({ _id: { $in: userIds } }).exec();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  return {
    reports: reports.map((report) =>
      toAdminReportDto(
        report,
        usersById.get(report.reporterId.toString()),
        report.targetUserId === null
          ? undefined
          : usersById.get(report.targetUserId.toString()),
      ),
    ),
  };
}

export async function updateAdminReport(
  context: AdminAuthContext,
  reportId: string,
  input: ReportStatusInput,
): Promise<AdminReportListResponse["reports"][number]> {
  const report = await ReportModel.findById(objectId(reportId)).exec();
  if (report === null)
    throw reportError("REPORT_NOT_FOUND", "The report was not found.", 404);
  report.status = input.status;
  report.resolvedByAdminId =
    input.status === "open" ? null : objectId(context.adminId);
  report.resolvedAt = input.status === "open" ? null : new Date();
  await report.save();
  const users = await UserModel.find({
    _id: {
      $in: [
        report.reporterId,
        ...(report.targetUserId === null ? [] : [report.targetUserId]),
      ],
    },
  }).exec();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  return toAdminReportDto(
    report,
    usersById.get(report.reporterId.toString()),
    report.targetUserId === null
      ? undefined
      : usersById.get(report.targetUserId.toString()),
  );
}

export async function initializeReportModels(): Promise<void> {
  await ReportModel.init();
}
