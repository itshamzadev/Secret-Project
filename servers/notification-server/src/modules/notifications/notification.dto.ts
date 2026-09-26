import type { PushDeviceRecord } from "./notification.types.js";

export interface PushDeviceDto {
  id: string;
  platform: "android";
  deviceId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toPushDeviceDto(device: PushDeviceRecord): PushDeviceDto {
  return { id: device.id, platform: device.platform, deviceId: device.deviceId, enabled: device.enabled, createdAt: device.createdAt, updatedAt: device.updatedAt };
}
