import { e2efeProtocolVersions } from "../../contracts/index.js";
import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

const base64Schema = z
  .string()
  .trim()
  .min(4)
  .max(8192)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "must be base64 encoded");

const preKeySchema = z.object({
  id: z.number().int().min(0).max(16_777_215),
  publicKey: base64Schema,
});

export const e2efeDeviceParamsSchema = z.object({
  deviceId: objectIdSchema,
});

export const e2efeUserParamsSchema = z.object({
  userId: objectIdSchema,
});

export const e2efeDeviceRegistrationSchema = z.object({
  deviceId: z.number().int().min(1).max(127),
  registrationId: z.number().int().min(1).max(16_380),
  protocolVersion: z.enum(e2efeProtocolVersions),
  identityPublicKey: base64Schema,
  signedPreKeyId: z.number().int().min(0).max(16_777_215),
  signedPreKeyPublic: base64Schema,
  signedPreKeySignature: base64Schema,
  kyberPreKeyId: z.number().int().min(0).max(16_777_215),
  kyberPreKeyPublic: base64Schema,
  kyberPreKeySignature: base64Schema,
  oneTimePreKeys: z.array(preKeySchema).max(100),
});

export const e2efePreKeysUpdateSchema = z.object({
  oneTimePreKeys: z.array(preKeySchema).max(100),
});

export type E2EFEDeviceRegistrationInput = z.infer<
  typeof e2efeDeviceRegistrationSchema
>;
export type E2EFEPreKeysUpdateInput = z.infer<
  typeof e2efePreKeysUpdateSchema
>;
