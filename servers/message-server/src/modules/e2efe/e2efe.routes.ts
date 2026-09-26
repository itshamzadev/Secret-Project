import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  getE2EFEPreKeyBundleController,
  listE2EFEDevicesController,
  registerE2EFEDeviceController,
  revokeE2EFEDeviceController,
  updateE2EFEPreKeysController,
} from "./e2efe.controller.js";

export function createE2EFERouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/devices/register", registerE2EFEDeviceController);
  router.put("/devices/:deviceId/prekeys", updateE2EFEPreKeysController);
  router.get("/users/:userId/devices", listE2EFEDevicesController);
  router.get("/devices/:deviceId/prekey-bundle", getE2EFEPreKeyBundleController);
  router.delete("/devices/:deviceId", revokeE2EFEDeviceController);
  return router;
}
