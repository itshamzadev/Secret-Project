import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  getPrivacySettings,
  updatePrivacySettings,
} from "./privacy.service.js";
import { updatePrivacySettingsSchema } from "./privacy.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

export const getPrivacySettingsController: RequestHandler = controller(
  async (request, response) => {
    response.status(200).json({
      success: true,
      data: await getPrivacySettings(requireAuthContext(request)),
    });
  },
);

export const updatePrivacySettingsController: RequestHandler = controller(
  async (request, response) => {
    response.status(200).json({
      success: true,
      data: await updatePrivacySettings(
        requireAuthContext(request),
        updatePrivacySettingsSchema.parse(request.body),
      ),
    });
  },
);
