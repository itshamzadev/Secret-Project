# Relationship Server

Phase 10 service for contacts, blocking, and relationship facts. It owns the
existing `contacts` and `user_blocks` MongoDB collections; it does not create a
new user collection and does not own authentication or privacy settings.

Public routes are mounted behind the Gateway without changing client paths:

- `GET|POST /api/v1/contacts`
- `PATCH|DELETE /api/v1/contacts/:userId`
- `PUT|DELETE /api/v1/users/:userId/block`

Internal routes require a short-lived HS256 service token in
`x-internal-service-token`:

- `POST /internal/relationships/check`
- `POST /internal/relationships/contacts/batch`

Identity resolution, access-token/session validation, and effective privacy
reads use narrow internal Auth Server endpoints. No password, refresh token,
Signal material, or message content crosses the service boundary.

## Local run

From this directory, install and build independently:

```powershell
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Set `MONGODB_URI`, `AUTH_SERVICE_URL`, and a 32+ character
`INTERNAL_SERVICE_SECRET` before starting. Default internal port is `5109`.

Message Server and Call Server call the internal policy endpoints over HTTP;
they do not import this service's models or source files. Legacy `apps/api`
keeps its compatibility readers/routes for direct monolith operation during
the transition, while the distributed Gateway routes contacts and block
operations here.
