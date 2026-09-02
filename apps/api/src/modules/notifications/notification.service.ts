import { Types } from "mongoose";

import type { PushDeviceDto } from "@terqivo/contracts";

import { isMongoDuplicateKeyError } from "../../utils/mongo.js";
import type { AuthContext } from "../auth/auth.types.js";
import { PushDeviceModel } from "./push-device.model.js";
import { toPushDeviceDto } from "./notification.dto.js";
import type { RegisterPushDeviceInput } from "./notification.validation.js";
import type { PushDeviceDocument } from "./push-device.types.js";

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

export async function registerPushDevice(
  context: AuthContext,
  input: RegisterPushDeviceInput,
): Promise<PushDeviceDto> {
  const values = {
    userId: objectId(context.userId),
    platform: input.platform,
    deviceId: input.deviceId ?? null,
    enabled: true,
  };

  try {
    const device = await PushDeviceModel.findOneAndUpdate(
      { pushToken: input.pushToken },
      {
        $set: values,
        $setOnInsert: { pushToken: input.pushToken },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).exec();
    if (device === null) throw new Error("Push device registration failed.");
    return toPushDeviceDto(device);
  } catch (error: unknown) {
    if (!isMongoDuplicateKeyError(error)) throw error;
    const device = await PushDeviceModel.findOneAndUpdate(
      { pushToken: input.pushToken },
      { $set: values },
      { returnDocument: "after" },
    ).exec();
    if (device === null) throw error;
    return toPushDeviceDto(device);
  }
}

export async function removePushDevice(
  context: AuthContext,
  pushToken: string,
): Promise<boolean> {
  const result = await PushDeviceModel.deleteOne({
    userId: objectId(context.userId),
    pushToken,
  }).exec();
  return result.deletedCount > 0;
}

export async function disablePushTokens(pushTokens: string[]): Promise<void> {
  if (pushTokens.length === 0) return;
  await PushDeviceModel.updateMany(
    { pushToken: { $in: pushTokens } },
    { $set: { enabled: false } },
  ).exec();
}

export async function getEnabledPushDevices(
  userId: string,
): Promise<PushDeviceDocument[]> {
  return PushDeviceModel.find({
    userId: objectId(userId),
    enabled: true,
  }).exec();
}

export async function initializeNotificationModels(): Promise<void> {
  await PushDeviceModel.init();
}
