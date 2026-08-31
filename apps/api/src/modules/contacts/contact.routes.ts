import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import {
  addContactController,
  listContactsController,
  removeContactController,
  updateContactController,
} from "./contact.controller.js";

export function createContactRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/", addContactController);
  router.get("/", listContactsController);
  router.patch("/:contactUserId", updateContactController);
  router.delete("/:contactUserId", removeContactController);
  return router;
}
