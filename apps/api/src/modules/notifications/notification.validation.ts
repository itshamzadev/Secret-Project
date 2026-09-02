import { pushPlatforms } from "@terqivo/contracts";
import { z } from "zod";

const expoPushTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^(?:Expo|Exponent)PushToken\[[^\]]+\]$/);

export const registerPushDeviceSchema = z.object({
  pushToken: expoPushTokenSchema,
  platform: z.enum(pushPlatforms),
  deviceId: z.string().trim().min(1).max(128).optional(),
});

export const removePushDeviceSchema = z.object({
  pushToken: expoPushTokenSchema,
});

export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;
