import mongoose from "mongoose";

import { env } from "../config/env.js";

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export function databaseStatus(): "connected" | "disconnected" {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}

export async function initializeNotificationModels(): Promise<void> {
  const { PushDeviceModel } = await import("../models/push-device.model.js");
  const { NotificationModel } = await import("../models/notification.model.js");
  await Promise.all([PushDeviceModel.init(), NotificationModel.init()]);
}
