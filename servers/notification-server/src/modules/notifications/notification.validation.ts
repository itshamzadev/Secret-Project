import { z } from "zod";

import { notificationTypes } from "../../models/notification.model.js";

const expoPushTokenSchema = z.string().trim().min(1).max(512).regex(/^(?:Expo|Exponent)PushToken\[[^\]]+\]$/);

export const registerPushDeviceSchema = z.object({
  pushToken: expoPushTokenSchema,
  platform: z.literal("android"),
  deviceId: z.string().trim().min(1).max(128).optional(),
});

export const removePushDeviceSchema = z.object({ pushToken: expoPushTokenSchema });

const notificationDataSchema = z.record(z.string().trim().min(1).max(64), z.string().max(512));

export const notificationIntentSchema = z.object({
  recipientUserId: z.string().trim().refine((value) => /^[a-f\d]{24}$/i.test(value), "Invalid recipient user id"),
  type: z.enum(notificationTypes),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(500),
  data: notificationDataSchema,
  channelId: z.enum(["messages", "calls"]),
  deduplicationKey: z.string().trim().min(1).max(256),
});

export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;
export type NotificationIntentInput = z.infer<typeof notificationIntentSchema>;
