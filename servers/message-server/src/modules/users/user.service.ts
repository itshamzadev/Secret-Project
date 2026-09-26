import { Types } from "mongoose";
import { UserModel } from "./user.model.js";
import type { UserDocument } from "./user.types.js";

export async function getUserById(userId: string): Promise<UserDocument | null> {
  if (!Types.ObjectId.isValid(userId)) return null;
  return UserModel.findById(userId).exec();
}
