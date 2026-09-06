import type { E2EFEDeviceDto, E2EFEPreKeyBundleDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import type { AuthContext } from "../auth/auth.types.js";
import { assertUsersCanInteract } from "../privacy/block.service.js";
import { UserModel } from "../users/user.model.js";
import { E2EFEDeviceModel } from "./e2efe-device.model.js";
import { E2EFEMessageEnvelopeModel } from "./e2efe-message-envelope.model.js";
import { toE2EFEDeviceDto, toE2EFEPreKeyBundleDto } from "./e2efe.dto.js";
import type {
  E2EFEDeviceRegistrationInput,
  E2EFEPreKeysUpdateInput,
} from "./e2efe.validation.js";
import type { E2EFEDeviceDocument } from "./e2efe-device.types.js";
import { isMongoDuplicateKeyError } from "../../utils/mongo.js";

function invalidDevice(): AppError {
  return new AppError({
    code: "E2EFE_DEVICE_NOT_FOUND",
    message: "The encryption device was not found.",
    statusCode: 404,
  });
}

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function identityConflict(): AppError {
  return new AppError({
    code: "E2EFE_IDENTITY_CONFLICT",
    message: "This encryption device identity is already registered.",
    statusCode: 409,
  });
}

function assertStableIdentity(
  device: E2EFEDeviceDocument,
  input: E2EFEDeviceRegistrationInput,
): void {
  if (
    device.registrationId !== input.registrationId ||
    device.protocolVersion !== input.protocolVersion ||
    device.identityPublicKey !== input.identityPublicKey
  ) {
    throw identityConflict();
  }
}

function applyMutableDeviceFields(
  device: E2EFEDeviceDocument,
  input: E2EFEDeviceRegistrationInput,
): void {
  device.signedPreKeyId = input.signedPreKeyId;
  device.signedPreKeyPublic = input.signedPreKeyPublic;
  device.signedPreKeySignature = input.signedPreKeySignature;
  device.kyberPreKeyId = input.kyberPreKeyId;
  device.kyberPreKeyPublic = input.kyberPreKeyPublic;
  device.kyberPreKeySignature = input.kyberPreKeySignature;
  device.active = true;
  device.revokedAt = null;
}

async function getOwnedDevice(
  context: AuthContext,
  deviceMongoId: string,
): Promise<E2EFEDeviceDocument> {
  const device = await E2EFEDeviceModel.findOne({
    _id: objectId(deviceMongoId),
    userId: objectId(context.userId),
  }).exec();
  if (device === null) throw invalidDevice();
  return device;
}

export async function registerE2EFEDevice(
  context: AuthContext,
  input: E2EFEDeviceRegistrationInput,
): Promise<E2EFEDeviceDto> {
  const userId = objectId(context.userId);
  const existing = await E2EFEDeviceModel.findOne({
    userId,
    deviceId: input.deviceId,
  }).exec();

  if (existing !== null) {
    assertStableIdentity(existing, input);
    applyMutableDeviceFields(existing, input);
    // One-time prekeys are consumed atomically by bundle requests. Never
    // replace the remaining list during a normal app-start registration.
    await existing.save();
    return toE2EFEDeviceDto(existing);
  }

  try {
    const device = await E2EFEDeviceModel.create({
      userId,
      deviceId: input.deviceId,
      registrationId: input.registrationId,
      protocolVersion: input.protocolVersion,
      identityPublicKey: input.identityPublicKey,
      signedPreKeyId: input.signedPreKeyId,
      signedPreKeyPublic: input.signedPreKeyPublic,
      signedPreKeySignature: input.signedPreKeySignature,
      kyberPreKeyId: input.kyberPreKeyId,
      kyberPreKeyPublic: input.kyberPreKeyPublic,
      kyberPreKeySignature: input.kyberPreKeySignature,
      oneTimePreKeys: input.oneTimePreKeys,
      active: true,
      revokedAt: null,
    });
    return toE2EFEDeviceDto(device);
  } catch (error) {
    // A concurrent registration may win the unique (userId, deviceId)
    // insert. Re-read it so the result remains deterministic and never
    // silently resets its consumed one-time prekeys.
    if (!isMongoDuplicateKeyError(error)) throw error;
    const concurrent = await E2EFEDeviceModel.findOne({
      userId,
      deviceId: input.deviceId,
    }).exec();
    if (concurrent === null) throw error;
    assertStableIdentity(concurrent, input);
    applyMutableDeviceFields(concurrent, input);
    await concurrent.save();
    return toE2EFEDeviceDto(concurrent);
  }
}

export async function updateE2EFEPreKeys(
  context: AuthContext,
  deviceMongoId: string,
  input: E2EFEPreKeysUpdateInput,
): Promise<E2EFEDeviceDto> {
  const device = await getOwnedDevice(context, deviceMongoId);
  if (!device.active) throw invalidDevice();
  device.oneTimePreKeys = input.oneTimePreKeys;
  await device.save();
  return toE2EFEDeviceDto(device);
}

export async function listE2EFEDevices(
  context: AuthContext,
  userId: string,
): Promise<E2EFEDeviceDto[]> {
  const target = await UserModel.findOne({
    _id: objectId(userId),
    accountStatus: "active",
  })
    .select({ _id: 1 })
    .exec();
  if (target === null) throw invalidDevice();
  if (context.userId !== userId) {
    await assertUsersCanInteract(context.userId, userId);
  }
  const devices = await E2EFEDeviceModel.find({
    userId: target._id,
    active: true,
  })
    .sort({ deviceId: 1 })
    .exec();
  return devices.map(toE2EFEDeviceDto);
}

export async function getE2EFEPreKeyBundle(
  context: AuthContext,
  deviceMongoId: string,
): Promise<E2EFEPreKeyBundleDto> {
  const device = await E2EFEDeviceModel.findOne({
    _id: objectId(deviceMongoId),
    active: true,
  }).exec();
  if (device === null) throw invalidDevice();
  await assertUsersCanInteract(context.userId, device.userId.toString());

  // Pop one one-time prekey atomically. The pre-image contains the exact key
  // selected for this request; concurrent callers cannot receive the same key.
  const consumed = await E2EFEDeviceModel.findOneAndUpdate(
    {
      _id: device._id,
      active: true,
      "oneTimePreKeys.0": { $exists: true },
    },
    { $pop: { oneTimePreKeys: 1 } },
    { returnDocument: "before" },
  ).exec();
  const selectedPreKey = consumed?.oneTimePreKeys.at(-1) ?? null;
  const current = consumed ?? device;
  return toE2EFEPreKeyBundleDto(current, selectedPreKey);
}

export async function revokeE2EFEDevice(
  context: AuthContext,
  deviceMongoId: string,
): Promise<boolean> {
  const result = await E2EFEDeviceModel.updateOne(
    {
      _id: objectId(deviceMongoId),
      userId: objectId(context.userId),
      active: true,
    },
    { $set: { active: false, revokedAt: new Date(), oneTimePreKeys: [] } },
  ).exec();
  return result.modifiedCount > 0;
}

export async function initializeE2EFEModels(): Promise<void> {
  await Promise.all([
    E2EFEDeviceModel.init(),
    E2EFEMessageEnvelopeModel.init(),
  ]);
}
