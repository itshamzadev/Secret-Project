import { Types } from "mongoose";

import { env } from "../../config/env.js";
import { logger } from "../../logging/logger.js";
import type { NotificationIntent, NotificationProvider, NotificationRecord, NotificationRepository, PushDeviceRepository } from "./notification.types.js";

function isObjectId(value: string): boolean { return Types.ObjectId.isValid(value); }

export function notificationPreview(message: { e2efeVersion?: string | null; type: string; text?: string | null }): string {
  if (message.e2efeVersion !== null && message.e2efeVersion !== undefined) return "New encrypted message";
  if (message.type === "image") return "Photo";
  if (message.type === "video") return "Video";
  if (message.type === "audio") return "Voice message";
  if (message.type === "file") return "File";
  const preview = message.text?.replace(/\s+/g, " ").trim() || "New message";
  return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview;
}

export interface DiagnosticResult {
  activeDeviceCount: number;
  expoTicketStatus: "ok" | "error" | "partial" | "not_sent";
  ticketIdPresent: boolean;
  expoReceiptStatus: "ok" | "error" | "not_checked";
  receiptErrorCode: string | null;
}

export class NotificationService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly devices: PushDeviceRepository,
    private readonly provider: NotificationProvider,
  ) {}

  async enqueue(intent: NotificationIntent): Promise<{ record: NotificationRecord; duplicate: boolean }> {
    if (!isObjectId(intent.recipientUserId)) throw new Error("Notification recipient is invalid.");
    const result = await this.notifications.createOrGet(intent);
    void this.dispatchById(result.record.id).catch((error: unknown) => logger.warn({ err: error, notificationId: result.record.id }, "Notification dispatch failed"));
    return result;
  }

  async dispatchById(id: string, options: { waitForReceipt?: boolean } = {}): Promise<NotificationRecord | null> {
    const record = await this.notifications.claim(id, new Date());
    if (record === null) return null;
    return this.deliver(record, options);
  }

  async processOne(): Promise<NotificationRecord | null> {
    const record = await this.notifications.claimNext(new Date());
    return record === null ? null : this.deliver(record);
  }

  async diagnostic(userId: string): Promise<DiagnosticResult> {
    const devices = await this.devices.enabledForUser(userId);
    if (devices.length === 0) return { activeDeviceCount: 0, expoTicketStatus: "not_sent", ticketIdPresent: false, expoReceiptStatus: "not_checked", receiptErrorCode: null };
    const messages = devices.map((device) => this.expoMessage({ title: "Terqivo Connect Test", body: "Push notifications are working.", data: { type: "diagnostic" }, channelId: "messages" }, device.pushToken));
    try {
      const result = await this.provider.send(messages, { waitForReceipt: true });
      const ticketStatus = result.ticketSummary.ticketCount === 0 ? "error" : result.ticketSummary.okTicketCount === result.ticketSummary.ticketCount ? "ok" : result.ticketSummary.okTicketCount === 0 ? "error" : "partial";
      await this.devices.disable(result.invalidTokens);
      return { activeDeviceCount: devices.length, expoTicketStatus: ticketStatus, ticketIdPresent: result.ticketIds.length > 0, expoReceiptStatus: result.receiptStatus, receiptErrorCode: result.receiptSummary?.errorCodes[0] ?? null };
    } catch (error: unknown) {
      logger.warn({ err: error, recipientId: userId }, "Diagnostic push delivery failed");
      return { activeDeviceCount: devices.length, expoTicketStatus: "error", ticketIdPresent: false, expoReceiptStatus: "not_checked", receiptErrorCode: null };
    }
  }

  private async deliver(record: NotificationRecord, options: { waitForReceipt?: boolean } = {}): Promise<NotificationRecord> {
    const devices = await this.devices.enabledForUser(record.recipientUserId);
    if (devices.length === 0) {
      await this.notifications.markSent(record.id, { activeDeviceCount: 0, ticketIds: [] });
      return { ...record, status: "sent", activeDeviceCount: 0 };
    }
    try {
      const result = await this.provider.send(devices.map((device) => this.expoMessage(record, device.pushToken)), options);
      await this.devices.disable(result.invalidTokens);
      if (result.ticketSummary.ticketCount === 0) throw new Error("EXPO_EMPTY_TICKET_RESPONSE");
      await this.notifications.markSent(record.id, { activeDeviceCount: devices.length, ticketIds: result.ticketIds });
      return { ...record, status: "sent", activeDeviceCount: devices.length, providerTicketIds: result.ticketIds };
    } catch (error: unknown) {
      const errorCode = error instanceof Error ? error.message.slice(0, 128) : "PUSH_DELIVERY_FAILED";
      if (record.attempts >= env.NOTIFICATION_MAX_ATTEMPTS) await this.notifications.markFailed(record.id, errorCode);
      else {
        const delay = Math.min(env.NOTIFICATION_RETRY_MAX_MS, env.NOTIFICATION_RETRY_BASE_MS * 2 ** Math.max(0, record.attempts - 1));
        await this.notifications.scheduleRetry(record.id, new Date(Date.now() + delay), errorCode);
      }
      logger.warn({ event: "notification.delivery_failed", notificationId: record.id, attempt: record.attempts, errorCode }, "Notification delivery failed");
      return { ...record, status: record.attempts >= env.NOTIFICATION_MAX_ATTEMPTS ? "failed" : "retry", lastErrorCode: errorCode };
    }
  }

  private expoMessage(record: Pick<NotificationRecord | NotificationIntent, "title" | "body" | "data" | "channelId">, token: string) {
    return { to: token, title: record.title, body: record.body, data: record.data, sound: "default" as const, priority: "high" as const, channelId: record.channelId };
  }
}
