import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NODE_ENV = "test";
process.env.PORT = "5000";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/terqivo_connect_test";
process.env.REDIS_URL = "redis://127.0.0.1:6379";
process.env.WEB_ORIGIN = "http://localhost:5173";
process.env.MEDIA_STORAGE_DRIVER = "local";
process.env.MEDIA_STORAGE_PATH = join(tmpdir(), "terqivo-connect-media-test");
process.env.JWT_ACCESS_SECRET =
  "test-access-secret-that-is-longer-than-32-characters";
process.env.JWT_REFRESH_SECRET =
  "test-refresh-secret-that-is-longer-than-32-characters";
process.env.AUTH_REGISTER_RATE_LIMIT_MAX = "1000";
process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "1000";
process.env.AUTH_REFRESH_RATE_LIMIT_MAX = "1000";
