import { e2efeProtocolVersions } from "@terqivo/contracts";
import { model, Schema } from "mongoose";

import type { E2EFEMessageEnvelopeEntity } from "./e2efe-message-envelope.types.js";

const e2efeMessageEnvelopeSchema = new Schema<E2EFEMessageEnvelopeEntity>(
  {
    messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderDeviceId: { type: Number, required: true, min: 1, max: 127 },
    recipientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipientDeviceId: { type: Number, required: true, min: 1, max: 127 },
    e2efeVersion: {
      type: String,
      enum: [...e2efeProtocolVersions],
      required: true,
    },
    envelopeType: { type: Number, enum: [2, 3], required: true },
    ciphertext: { type: String, required: true, maxlength: 2_000_000 },
  },
  { collection: "e2efe_message_envelopes", timestamps: true, versionKey: false },
);

e2efeMessageEnvelopeSchema.index(
  { messageId: 1, recipientUserId: 1, recipientDeviceId: 1 },
  { unique: true },
);
e2efeMessageEnvelopeSchema.index({ conversationId: 1, recipientUserId: 1, recipientDeviceId: 1, createdAt: -1 });

export const E2EFEMessageEnvelopeModel = model<E2EFEMessageEnvelopeEntity>(
  "E2EFEMessageEnvelope",
  e2efeMessageEnvelopeSchema,
);
