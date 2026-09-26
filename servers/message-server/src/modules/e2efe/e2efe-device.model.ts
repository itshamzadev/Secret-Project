import { e2efeProtocolVersions } from "../../contracts/index.js";
import { model, Schema } from "mongoose";

import type { E2EFEDeviceEntity } from "./e2efe-device.types.js";

const oneTimePreKeySchema = new Schema(
  {
    id: { type: Number, required: true, min: 0, max: 16_777_215 },
    publicKey: { type: String, required: true, maxlength: 4096 },
  },
  { _id: false },
);

const e2efeDeviceSchema = new Schema<E2EFEDeviceEntity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deviceId: { type: Number, required: true, min: 1, max: 127 },
    registrationId: { type: Number, required: true, min: 1, max: 16_380 },
    protocolVersion: {
      type: String,
      enum: [...e2efeProtocolVersions],
      required: true,
    },
    identityPublicKey: { type: String, required: true, maxlength: 4096 },
    signedPreKeyId: { type: Number, required: true, min: 0, max: 16_777_215 },
    signedPreKeyPublic: { type: String, required: true, maxlength: 4096 },
    signedPreKeySignature: { type: String, required: true, maxlength: 4096 },
    kyberPreKeyId: { type: Number, required: true, min: 0, max: 16_777_215 },
    kyberPreKeyPublic: { type: String, required: true, maxlength: 8192 },
    kyberPreKeySignature: { type: String, required: true, maxlength: 4096 },
    oneTimePreKeys: { type: [oneTimePreKeySchema], default: [] },
    active: { type: Boolean, default: true },
    revokedAt: { type: Date, default: null },
  },
  { collection: "e2efe_devices", timestamps: true, versionKey: false },
);

e2efeDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
e2efeDeviceSchema.index({ userId: 1, active: 1, updatedAt: -1 });
e2efeDeviceSchema.index({ active: 1, "oneTimePreKeys.0": 1 });

export const E2EFEDeviceModel = model<E2EFEDeviceEntity>(
  "E2EFEDevice",
  e2efeDeviceSchema,
);
