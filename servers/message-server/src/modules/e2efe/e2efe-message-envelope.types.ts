import type { HydratedDocument, Types } from "mongoose";

import type { E2EFEProtocolVersion } from "../../contracts/index.js";

export interface E2EFEMessageEnvelopeEntity {
  messageId: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderDeviceId: number;
  recipientUserId: Types.ObjectId;
  recipientDeviceId: number;
  e2efeVersion: E2EFEProtocolVersion;
  envelopeType: number;
  ciphertext: string;
  createdAt: Date;
  updatedAt: Date;
}

export type E2EFEMessageEnvelopeDocument = HydratedDocument<E2EFEMessageEnvelopeEntity>;
