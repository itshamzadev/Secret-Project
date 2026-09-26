import { Types } from "mongoose";

import type { AuthClient, AuthContext, PublicUser } from "../../clients/auth.client.js";
import type { MediaClient } from "../../clients/media.client.js";
import type { RelationshipClient } from "../../clients/relationship.client.js";
import { AppError } from "../../core/errors.js";
import { StatusModel } from "../../models/status.model.js";
import type { StatusDocument, StatusMediaEntity } from "../../models/status.types.js";
import { toStatusDto, type StatusDto } from "./status.dto.js";
import type { CreateStatusInput, StatusMediaUploadInput } from "./status.validation.js";

const statusNotFound = () => new AppError({ code: "STATUS_NOT_FOUND", message: "The status was not found.", statusCode: 404 });
const ownerNotFound = () => new AppError({ code: "STATUS_OWNER_NOT_FOUND", message: "Your account was not found.", statusCode: 404 });
const objectId = (value: string): Types.ObjectId => new Types.ObjectId(value);

export interface StatusServiceDependencies {
  readonly auth: AuthClient;
  readonly relationships: RelationshipClient;
  readonly media: MediaClient;
}

export class StatusService {
  public constructor(private readonly dependencies: StatusServiceDependencies) {}

  public async listStatuses(context: AuthContext): Promise<{ statuses: StatusDto[] }> {
    await this.removeExpiredStatuses();
    const now = new Date();
    const ownerIds = (await StatusModel.distinct("ownerId", { expiresAt: { $gt: now } })).map((id) => id.toString());
    const visibility = await this.visibleOwnerIds(context.userId, ownerIds);
    const statuses = await StatusModel.find({ ownerId: { $in: visibility.map(objectId) }, expiresAt: { $gt: now } }).sort({ createdAt: -1, _id: -1 }).limit(100).exec();
    const viewerIds = uniqueIds(statuses.flatMap((status) => status.viewedBy.map((id) => id.toString())));
    const users = await this.dependencies.auth.batchPublicUsers(uniqueIds([...visibility, ...viewerIds]));
    const usersById = new Map(users.map((user) => [user.id, user]));
    return { statuses: statuses.flatMap((status) => { const owner = usersById.get(status.ownerId.toString()); return owner === undefined ? [] : [toStatusDto(status, owner, context.userId, users)]; }) };
  }

  public async createStatus(context: AuthContext, input: CreateStatusInput): Promise<StatusDto> {
    const owner = await this.requireActiveOwner(context.userId);
    const status = await StatusModel.create({ ownerId: objectId(context.userId), type: "text", text: input.text, media: null, viewedBy: [objectId(context.userId)], expiresAt: expiresAt() });
    return toStatusDto(status, owner, context.userId);
  }

  public async createMediaStatus(context: AuthContext, input: StatusMediaUploadInput, media: StatusMediaEntity): Promise<StatusDto> {
    const owner = await this.requireActiveOwner(context.userId);
    try {
      const status = await StatusModel.create({ ownerId: objectId(context.userId), type: input.type, text: input.text, media, viewedBy: [objectId(context.userId)], expiresAt: expiresAt() });
      return toStatusDto(status, owner, context.userId);
    } catch (error) {
      await this.dependencies.media.remove(media.storageKey).catch(() => undefined);
      throw error;
    }
  }

  public async getVisibleStatus(context: AuthContext, statusId: string): Promise<StatusDocument> {
    if (!Types.ObjectId.isValid(statusId)) throw statusNotFound();
    const status = await StatusModel.findOne({ _id: objectId(statusId), expiresAt: { $gt: new Date() } }).exec();
    if (status === null) throw statusNotFound();
    if (status.ownerId.toString() === context.userId) return status;
    const [visibility] = await this.dependencies.relationships.statusVisibility(context.userId, [status.ownerId.toString()]);
    if (visibility === undefined || visibility.blocked || !visibility.areContacts) throw statusNotFound();
    return status;
  }

  public async markStatusViewed(context: AuthContext, statusId: string): Promise<void> {
    const status = await this.getVisibleStatus(context, statusId);
    await StatusModel.updateOne({ _id: status._id }, { $addToSet: { viewedBy: objectId(context.userId) } }).exec();
  }

  public async deleteStatus(context: AuthContext, statusId: string): Promise<void> {
    if (!Types.ObjectId.isValid(statusId)) throw statusNotFound();
    const status = await StatusModel.findOne({ _id: objectId(statusId), ownerId: objectId(context.userId) }).exec();
    if (status === null) throw statusNotFound();
    const result = await StatusModel.deleteOne({ _id: status._id, ownerId: objectId(context.userId) }).exec();
    if (result.deletedCount === 0) throw statusNotFound();
    if (status.media?.storageKey !== undefined) await this.dependencies.media.remove(status.media.storageKey).catch(() => undefined);
  }

  public async removeExpiredStatuses(): Promise<void> {
    const cutoff = new Date();
    const expired = await StatusModel.find({ expiresAt: { $lte: cutoff } }).select({ media: 1 }).exec();
    await Promise.all(expired.map((status) => status.media?.storageKey === undefined ? Promise.resolve() : this.dependencies.media.remove(status.media.storageKey).catch(() => undefined)));
    await StatusModel.deleteMany({ expiresAt: { $lte: cutoff } }).exec();
  }

  public async initialize(): Promise<void> { await StatusModel.init(); }

  public putMedia(storageKey: string, data: Buffer): Promise<void> { return this.dependencies.media.put(storageKey, data); }
  public openMedia(storageKey: string, mimeType: string) { return this.dependencies.media.open(storageKey, mimeType); }
  public removeMedia(storageKey: string): Promise<void> { return this.dependencies.media.remove(storageKey); }

  private async requireActiveOwner(userId: string): Promise<PublicUser> {
    const [owner] = await this.dependencies.auth.batchPublicUsers([userId]);
    if (owner === undefined) throw ownerNotFound();
    return owner;
  }

  private async visibleOwnerIds(viewerId: string, ownerIds: string[]): Promise<string[]> {
    const uniqueOwnerIds = uniqueIds(ownerIds);
    const otherOwnerIds = uniqueOwnerIds.filter((ownerId) => ownerId !== viewerId);
    if (otherOwnerIds.length === 0) return uniqueOwnerIds.includes(viewerId) ? [viewerId] : [];
    const visibility = await this.dependencies.relationships.statusVisibility(viewerId, otherOwnerIds);
    const visible = visibility.filter((item) => !item.blocked && item.areContacts).map((item) => item.ownerId);
    return uniqueIds([...(uniqueOwnerIds.includes(viewerId) ? [viewerId] : []), ...visible]);
  }
}

function expiresAt(): Date { return new Date(Date.now() + 24 * 60 * 60 * 1000); }
function uniqueIds(values: string[]): string[] { return [...new Set(values)]; }
