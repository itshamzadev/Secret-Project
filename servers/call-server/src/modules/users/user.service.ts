import { Types } from "mongoose";

import { UserModel } from "../../models/user.model.js";

export async function getUserById(userId: string) {
  if (!Types.ObjectId.isValid(userId)) return null;
  return UserModel.findById(userId).exec();
}
