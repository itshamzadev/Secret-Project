process.env.NODE_ENV = "test";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/terqivo_connect_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-change-me-1234567890";
process.env.ADMIN_JWT_SECRET ??= "test-admin-secret-change-me-1234567890";
process.env.INTERNAL_SERVICE_SECRET ??= "test-internal-secret-change-me-1234567890";
process.env.WEB_ORIGIN ??= "http://localhost:3000";
