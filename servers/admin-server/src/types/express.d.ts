import type { AdminPermission, AdminRole } from "../modules/admin/contracts.js";

declare global {
  namespace Express {
    interface Request {
      admin?: { adminId: string; role: AdminRole; permissions: AdminPermission[] };
      adminUser?: { userId: string; sessionId: string };
      adminRequestContext?: { requestId: string; correlationId: string };
    }
  }
}

export {};
