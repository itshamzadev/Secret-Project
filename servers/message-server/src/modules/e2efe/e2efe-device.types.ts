import type { HydratedDocument, Types } from "mongoose";

import type { E2EFEProtocolVersion } from "../../contracts/index.js";

export interface E2EFEOneTimePreKey {
  id: number;
  publicKey: string;
}

export interface E2EFEDeviceEntity {
  userId: Types.ObjectId;
  deviceId: number;
  registrationId: number;
  protocolVersion: E2EFEProtocolVersion;
  identityPublicKey: string;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  kyberPreKeyId: number;
  kyberPreKeyPublic: string;
  kyberPreKeySignature: string;
  oneTimePreKeys: E2EFEOneTimePreKey[];
  active: boolean;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type E2EFEDeviceDocument = HydratedDocument<E2EFEDeviceEntity>;
