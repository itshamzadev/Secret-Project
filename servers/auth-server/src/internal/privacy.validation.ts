import { z } from "zod";

export const updatePrivacySettingsSchema = z.object({
  profilePhoto: z.enum(["everyone", "contacts", "nobody"]).optional(),
  lastSeen: z.enum(["everyone", "contacts", "nobody"]).optional(),
  readReceipts: z.boolean().optional(),
  messageRequests: z.enum(["everyone", "contacts"]).optional(),
});
