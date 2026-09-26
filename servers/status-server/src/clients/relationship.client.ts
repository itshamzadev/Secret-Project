import { AppError } from "../core/errors.js";
import { issueServiceToken } from "../auth/service-auth.js";
import type { StatusServerConfig } from "../config.js";

export interface StatusVisibility { ownerId: string; blocked: boolean; areContacts: boolean; }

export interface RelationshipClient { statusVisibility(viewerId: string, ownerIds: string[]): Promise<StatusVisibility[]>; }

export class HttpRelationshipClient implements RelationshipClient {
  public constructor(private readonly config: StatusServerConfig) {}

  public async statusVisibility(viewerId: string, ownerIds: string[]): Promise<StatusVisibility[]> {
    let token: string;
    try { token = await issueServiceToken(this.config); }
    catch { throw relationshipUnavailable(); }
    try {
      const response = await fetch(`${this.config.RELATIONSHIP_SERVICE_URL}/internal/relationships/status-visibility`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "x-internal-service-token": token },
        body: JSON.stringify({ viewerId, ownerIds }),
        signal: AbortSignal.timeout(5000),
      });
      const body = await response.json().catch(() => undefined) as { success?: boolean; data?: { visibility?: StatusVisibility[] } } | undefined;
      if (!response.ok || body?.success !== true || body.data?.visibility === undefined) throw relationshipUnavailable();
      return body.data.visibility;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw relationshipUnavailable();
    }
  }
}

function relationshipUnavailable(): AppError { return new AppError({ code: "RELATIONSHIP_SERVICE_UNAVAILABLE", message: "Relationship information is temporarily unavailable.", statusCode: 503 }); }
