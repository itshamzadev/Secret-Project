# Authentication

Phase 1 authentication is implemented here using thin Express controllers, service-level business logic, Argon2id password hashing, JOSE JWT access tokens, and opaque rotating refresh tokens.

Registration requires a username, name, valid international phone number, and
password. Email is optional and normalized when supplied. Login accepts a
username, phone number, or email.

The `AuthSession` collection stores one record per device session. It stores only a keyed hash of each refresh token. Access-token authentication also checks that the referenced user session remains active, so logout and logout-all take effect immediately.

Access tokens last 15 minutes by default. Each successful refresh rotates the
refresh token and extends the session's `expiresAt` by the configured
`REFRESH_TOKEN_TTL_DAYS` sliding window (365 days by default). There is no
infinite-lived access token; an idle session past that window, explicit revoke,
account status change, or refresh-token replay requires a new login.

Routes are mounted under `/api/v1/auth` by the API application. Browser-compatible clients can use the HttpOnly refresh cookie; native clients can send the refresh token in the refresh request body.
