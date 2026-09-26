import { AppError } from "../core/errors.js";

import type { AdminServerConfig } from "../config/env.js";
import { validateUserAccessToken } from "../clients/auth.client.js";

export interface UserAuthContext { userId: string; sessionId: string; }

export async function authenticateUserToken(config: AdminServerConfig, header: string | undefined): Promise<UserAuthContext> {
  if (header === undefined) throw new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 });
  const [scheme, token] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token.length === 0) throw invalidToken();
  void config;
  try {
    const result = await validateUserAccessToken(config, token);
    return result.data;
  } catch (error) {
    if (error instanceof AppError && (error.statusCode === 403 || error.code === "ACCOUNT_SUSPENDED" || error.code === "ACCOUNT_DISABLED")) throw error;
    throw invalidToken();
  }
}

function invalidToken(): AppError { return new AppError({ code: "INVALID_ACCESS_TOKEN", message: "The access token is invalid or expired.", statusCode: 401 }); }
