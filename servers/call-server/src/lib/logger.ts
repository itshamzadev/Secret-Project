import pino from "pino";

import { env } from "../config/env.js";

export const logger = pino({
  name: env.SERVICE_NAME,
  level: env.LOG_LEVEL,
  base: { service: env.SERVICE_NAME, version: env.SERVICE_VERSION },
});
