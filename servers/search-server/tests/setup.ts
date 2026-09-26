process.env.NODE_ENV = "test";
process.env.AUTH_SERVICE_URL = "http://127.0.0.1:5101";
process.env.INTERNAL_SERVICE_SECRET = "test-internal-secret-with-more-than-32-characters";
process.env.INTERNAL_SERVICE_ISSUER = "terqivo-internal";
process.env.INTERNAL_SERVICE_AUDIENCE = "terqivo-services";
process.env.WEB_ORIGIN = "http://localhost:3000";
process.env.LOG_LEVEL = "silent";
