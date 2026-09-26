import { model, Schema, type Types } from "mongoose";

interface ConversationEntity { _id: Types.ObjectId; directKey: string; }

const schema = new Schema<ConversationEntity>({
  directKey: { type: String, required: true },
}, { collection: "conversations", strict: false, versionKey: false });

export const ConversationModel = model<ConversationEntity>("CallConversation", schema, "conversations");
