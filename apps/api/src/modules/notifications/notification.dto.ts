import type { PushDeviceDto } from "@terqivo/contracts";

import type { PushDeviceDocument } from "./push-device.types.js";

export function toPushDeviceDto(device: PushDeviceDocument): PushDeviceDto {
  return {
    id: device._id.toString(),
    platform: device.platform,
    deviceId: device.deviceId,
    enabled: device.enabled,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  };
}
