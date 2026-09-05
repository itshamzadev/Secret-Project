import { existsSync } from "node:fs";
import path from "node:path";

import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { logger } from "../lib/logger.js";

function resolveAdminUiDirectory(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "admin-ui"),
    path.resolve(process.cwd(), "../admin-ui/dist"),
    path.resolve(process.cwd(), "apps/admin-ui/dist"),
  ];

  return (
    candidates.find((candidate) =>
      existsSync(path.join(candidate, "index.html")),
    ) ?? null
  );
}

export function mountAdminUi(app: Express): void {
  const directory = resolveAdminUiDirectory();
  if (directory === null) {
    logger.debug("Admin UI bundle not found; static admin UI is disabled");
    return;
  }

  // Frontend assets are public. Admin authorization applies only to the
  // /api/v1/admin router, never to the JavaScript or CSS needed to render its
  // login page. Keep this mount before the SPA fallback so a missing/blocked
  // asset cannot be replaced by index.html or another /admin handler.
  app.use(
    "/admin/assets",
    express.static(path.join(directory, "assets"), {
      index: false,
    }),
  );
  app.use("/admin", express.static(directory, { index: "index.html" }));
  app.use(
    "/admin",
    (request: Request, response: Response, next: NextFunction) => {
      if (request.path === "/assets" || request.path.startsWith("/assets/")) {
        next();
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        next();
        return;
      }

      response.sendFile(path.join(directory, "index.html"), (error) => {
        if (error !== undefined) next(error);
      });
    },
  );
  logger.info({ adminUiDirectory: directory }, "Admin UI mounted");
}
