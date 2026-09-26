import type { NotificationStatus, NotificationType } from "../../models/notification.model.js";

export interface NotificationIntent {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string>;
  channelId: "messages" | "calls";
  deduplicationKey: string;
}

export interface NotificationRecord {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string>;
  channelId: "messages" | "calls";
  deduplicationKey: string;
  status: NotificationStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  lastErrorCode: string | null;
  providerTicketIds: string[];
  activeDeviceCount: number;
}

export interface PushDeviceRecord {
  id: string;
  userId: string;
  pushToken: string;
  platform: "android";
  deviceId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpoTicketSummary {
  ticketCount: number;
  okTicketCount: number;
  ticketIdCount: number;
  errorCodes: string[];
}

export interface ExpoReceiptSummary {
  receiptCount: number;
  okReceiptCount: number;
  errorReceiptCount: number;
  errorCodes: string[];
}

export interface ExpoDeliveryResult {
  ticketSummary: ExpoTicketSummary;
  receiptStatus: "ok" | "error" | "not_checked";
  receiptSummary: ExpoReceiptSummary | null;
  ticketIds: string[];
  invalidTokens: string[];
}

export interface NotificationRepository {
  createOrGet(intent: NotificationIntent): Promise<{ record: NotificationRecord; duplicate: boolean }>;
  claim(id: string, now: Date): Promise<NotificationRecord | null>;
  claimNext(now: Date): Promise<NotificationRecord | null>;
  markSent(id: string, details: { activeDeviceCount: number; ticketIds: string[] }): Promise<void>;
  scheduleRetry(id: string, nextAttemptAt: Date, errorCode: string): Promise<void>;
  markFailed(id: string, errorCode: string): Promise<void>;
}

export interface PushDeviceRepository {
  register(userId: string, input: { pushToken: string; platform: "android"; deviceId: string | null }): Promise<PushDeviceRecord>;
  remove(userId: string, pushToken: string): Promise<boolean>;
  disable(tokens: string[]): Promise<void>;
  enabledForUser(userId: string): Promise<PushDeviceRecord[]>;
}

export interface NotificationProvider {
  send(messages: Array<{ to: string; title: string; body: string; data: Record<string, string>; sound: "default"; priority: "high"; channelId: "messages" | "calls" }>, options?: { waitForReceipt?: boolean }): Promise<ExpoDeliveryResult>;
}
