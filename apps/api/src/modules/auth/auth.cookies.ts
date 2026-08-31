import type { CookieOptions, Response } from "express";

import { env } from "../../config/env.js";

export const REFRESH_COOKIE_NAME = "terqivo_refresh_token";

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  path: "/api/v1/auth",
};

export function setRefreshTokenCookie(
  response: Response,
  refreshToken: string,
  expiresAt: Date,
): void {
  response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...refreshCookieOptions,
    expires: expiresAt,
    maxAge: Math.max(expiresAt.getTime() - Date.now(), 0),
  });
}

export function clearRefreshTokenCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
}
