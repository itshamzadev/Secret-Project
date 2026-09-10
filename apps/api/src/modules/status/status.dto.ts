import type { StatusDto } from "@terqivo/contracts";

import { toContactUserDto } from "../contacts/contact.dto.js";
import type { UserDocument } from "../users/user.types.js";
import type { StatusDocument } from "./status.types.js";

export function toStatusDto(
  status: StatusDocument,
  owner: UserDocument,
  viewerId: string,
  viewerUsers: UserDocument[] = [],
): StatusDto {
  const statusId = status._id.toString();
  const viewedUserIds = new Set(
    status.viewedBy
      .map((id) => id.toString())
      .filter((id) => id !== owner._id.toString()),
  );
  const viewers = viewerUsers
    .filter((user) => viewedUserIds.has(user._id.toString()))
    .map(toContactUserDto);
  const media = status.media ?? null;
  return {
    id: statusId,
    author: toContactUserDto(owner),
    type: status.type ?? "text",
    text: status.text ?? "",
    media:
      media === null
        ? null
        : {
            url: `/api/v1/status/${statusId}/media`,
            mimeType: media.mimeType,
            size: media.size,
            width: media.width,
            height: media.height,
            durationSeconds: media.durationSeconds,
          },
    viewed: status.viewedBy.some((id) => id.toString() === viewerId),
    viewerCount: viewedUserIds.size,
    viewers: owner._id.toString() === viewerId ? viewers : [],
    createdAt: status.createdAt.toISOString(),
    expiresAt: status.expiresAt.toISOString(),
  };
}
