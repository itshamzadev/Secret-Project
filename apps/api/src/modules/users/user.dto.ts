import type { SafeUserDto } from "@terqivo/contracts";

import type { UserDocument } from "./user.types.js";

export function toSafeUserDto(user: UserDocument): SafeUserDto {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role,
    accountStatus: user.accountStatus,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
