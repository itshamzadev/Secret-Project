import type { GroupDto } from "@terqivo/contracts";

import { toContactUserDto } from "../contacts/contact.dto.js";
import type { UserDocument } from "../users/user.types.js";
import type { GroupDocument } from "./group.types.js";

export function toGroupDto(
  group: GroupDocument,
  usersById: Map<string, UserDocument>,
): GroupDto | null {
  const owner = usersById.get(group.ownerId.toString());
  if (owner === undefined) return null;
  const members = group.memberIds.flatMap((memberId) => {
    const member = usersById.get(memberId.toString());
    return member === undefined ? [] : [toContactUserDto(member)];
  });
  return {
    id: group._id.toString(),
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
    owner: toContactUserDto(owner),
    members,
    memberCount: group.memberIds.length,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}
