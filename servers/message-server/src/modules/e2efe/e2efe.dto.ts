import type {
  E2EFEDeviceDto,
  E2EFEPreKeyBundleDto,
} from "../../contracts/index.js";

import type { E2EFEDeviceDocument } from "./e2efe-device.types.js";

export function toE2EFEDeviceDto(
  device: E2EFEDeviceDocument,
): E2EFEDeviceDto {
  return {
    id: device._id.toString(),
    userId: device.userId.toString(),
    deviceId: device.deviceId,
    registrationId: device.registrationId,
    protocolVersion: device.protocolVersion,
    identityPublicKey: device.identityPublicKey,
    signedPreKeyId: device.signedPreKeyId,
    signedPreKeyPublic: device.signedPreKeyPublic,
    signedPreKeySignature: device.signedPreKeySignature,
    oneTimePreKeyCount: device.oneTimePreKeys.length,
    active: device.active,
    revokedAt: device.revokedAt?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  };
}

export function toE2EFEPreKeyBundleDto(
  device: E2EFEDeviceDocument,
  preKey: { id: number; publicKey: string } | null,
): E2EFEPreKeyBundleDto {
  return {
    deviceId: device.deviceId,
    registrationId: device.registrationId,
    protocolVersion: device.protocolVersion,
    preKeyId: preKey?.id ?? null,
    preKeyPublic: preKey?.publicKey ?? null,
    signedPreKeyId: device.signedPreKeyId,
    signedPreKeyPublic: device.signedPreKeyPublic,
    signedPreKeySignature: device.signedPreKeySignature,
    identityPublicKey: device.identityPublicKey,
    kyberPreKeyId: device.kyberPreKeyId,
    kyberPreKeyPublic: device.kyberPreKeyPublic,
    kyberPreKeySignature: device.kyberPreKeySignature,
  };
}
