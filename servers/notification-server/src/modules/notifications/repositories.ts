import { Types } from "mongoose";

import { isMongoDuplicateKeyError } from "../../utils/mongo.js";
import { NotificationModel, type NotificationEntity } from "../../models/notification.model.js";
import { PushDeviceModel, type PushDeviceDocument } from "../../models/push-device.model.js";
import type { NotificationRecord, NotificationRepository, PushDeviceRecord, PushDeviceRepository } from "./notification.types.js";

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function toDeviceRecord(device: PushDeviceDocument): PushDeviceRecord {
  return { id: device._id.toString(), userId: device.userId.toString(), pushToken: device.pushToken, platform: device.platform, deviceId: device.deviceId, enabled: device.enabled, createdAt: device.createdAt.toISOString(), updatedAt: device.updatedAt.toISOString() };
}

function toNotificationRecord(record: NotificationEntity & { _id: Types.ObjectId }): NotificationRecord {
  const rawData = record.data instanceof Map ? Object.fromEntries(record.data.entries()) : record.data;
  return { id: record._id.toString(), recipientUserId: record.recipientId.toString(), type: record.type, title: record.title, body: record.body, data: rawData, channelId: record.channelId, deduplicationKey: record.deduplicationKey, status: record.status, attempts: record.attempts, nextAttemptAt: record.nextAttemptAt, lastErrorCode: record.lastErrorCode, providerTicketIds: record.providerTicketIds, activeDeviceCount: record.activeDeviceCount };
}

export const mongoPushDeviceRepository: PushDeviceRepository = {
  async register(userId, input) {
    const values = { userId: objectId(userId), platform: input.platform, deviceId: input.deviceId, enabled: true };
    try {
      const device = await PushDeviceModel.findOneAndUpdate({ pushToken: input.pushToken }, { $set: values, $setOnInsert: { pushToken: input.pushToken } }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }).exec();
      if (device === null) throw new Error("Push device registration failed.");
      return toDeviceRecord(device);
    } catch (error: unknown) {
      if (!isMongoDuplicateKeyError(error)) throw error;
      const device = await PushDeviceModel.findOneAndUpdate({ pushToken: input.pushToken }, { $set: values }, { returnDocument: "after" }).exec();
      if (device === null) throw error;
      return toDeviceRecord(device);
    }
  },
  async remove(userId, pushToken) {
    const result = await PushDeviceModel.deleteOne({ userId: objectId(userId), pushToken }).exec();
    return result.deletedCount > 0;
  },
  async disable(tokens) {
    if (tokens.length > 0) await PushDeviceModel.updateMany({ pushToken: { $in: tokens } }, { $set: { enabled: false } }).exec();
  },
  async enabledForUser(userId) {
    return (await PushDeviceModel.find({ userId: objectId(userId), enabled: true }).exec()).map(toDeviceRecord);
  },
};

export const mongoNotificationRepository: NotificationRepository = {
  async createOrGet(intent) {
    const recipientId = objectId(intent.recipientUserId);
    const idempotencyKey = `${intent.recipientUserId}:${intent.deduplicationKey}`;
    const existing = await NotificationModel.findOne({ idempotencyKey }).exec();
    if (existing !== null) return { record: toNotificationRecord(existing), duplicate: true };
    try {
      const record = await NotificationModel.create({ recipientId, type: intent.type, title: intent.title, body: intent.body, data: intent.data, channelId: intent.channelId, deduplicationKey: intent.deduplicationKey, idempotencyKey, status: "pending", attempts: 0, nextAttemptAt: null, lastErrorCode: null, providerTicketIds: [], activeDeviceCount: 0, sentAt: null });
      return { record: toNotificationRecord(record), duplicate: false };
    } catch (error: unknown) {
      if (!isMongoDuplicateKeyError(error)) throw error;
      const record = await NotificationModel.findOne({ idempotencyKey }).exec();
      if (record === null) throw error;
      return { record: toNotificationRecord(record), duplicate: true };
    }
  },
  async claim(id, now) {
    const record = await NotificationModel.findOneAndUpdate({ _id: objectId(id), $or: [{ status: "pending" }, { status: "retry", nextAttemptAt: { $lte: now } }] }, { $set: { status: "processing", nextAttemptAt: null }, $inc: { attempts: 1 } }, { returnDocument: "after" }).exec();
    return record === null ? null : toNotificationRecord(record);
  },
  async claimNext(now) {
    const record = await NotificationModel.findOneAndUpdate({ $or: [{ status: "pending" }, { status: "retry", nextAttemptAt: { $lte: now } }] }, { $set: { status: "processing", nextAttemptAt: null }, $inc: { attempts: 1 } }, { sort: { createdAt: 1 }, returnDocument: "after" }).exec();
    return record === null ? null : toNotificationRecord(record);
  },
  async markSent(id, details) {
    await NotificationModel.updateOne({ _id: objectId(id) }, { $set: { status: "sent", sentAt: new Date(), activeDeviceCount: details.activeDeviceCount, providerTicketIds: details.ticketIds, lastErrorCode: null } }).exec();
  },
  async scheduleRetry(id, nextAttemptAt, errorCode) {
    await NotificationModel.updateOne({ _id: objectId(id) }, { $set: { status: "retry", nextAttemptAt, lastErrorCode: errorCode } }).exec();
  },
  async markFailed(id, errorCode) {
    await NotificationModel.updateOne({ _id: objectId(id) }, { $set: { status: "failed", lastErrorCode: errorCode } }).exec();
  },
};
