import { model, Schema, type HydratedDocument, type Types } from "mongoose";

export const notificationTypes = ["message", "incoming_call", "missed_call", "diagnostic"] as const;
export type NotificationType = (typeof notificationTypes)[number];
export const notificationStatuses = ["pending", "processing", "retry", "sent", "failed"] as const;
export type NotificationStatus = (typeof notificationStatuses)[number];

export interface NotificationEntity {
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string>;
  channelId: "messages" | "calls";
  deduplicationKey: string;
  idempotencyKey: string;
  status: NotificationStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  lastErrorCode: string | null;
  providerTicketIds: string[];
  activeDeviceCount: number;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

export type NotificationDocument = HydratedDocument<NotificationEntity>;

const schema = new Schema<NotificationEntity>(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: notificationTypes, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 500 },
    data: { type: Map, of: String, required: true },
    channelId: { type: String, enum: ["messages", "calls"], required: true },
    deduplicationKey: { type: String, required: true, maxlength: 256 },
    idempotencyKey: { type: String, required: true, unique: true, maxlength: 320 },
    status: { type: String, enum: notificationStatuses, required: true, default: "pending" },
    attempts: { type: Number, required: true, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: null, maxlength: 128 },
    providerTicketIds: { type: [String], default: [] },
    activeDeviceCount: { type: Number, default: 0 },
    sentAt: { type: Date, default: null },
  },
  { collection: "notifications", timestamps: true, versionKey: false },
);

schema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
schema.index({ recipientId: 1, createdAt: -1 });

export const NotificationModel = model<NotificationEntity>("Notification", schema, "notifications");
