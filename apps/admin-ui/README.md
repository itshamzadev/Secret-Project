# Terqivo Admin UI

This React dashboard is served by the Node API at `/admin` after a production
build. It uses the existing authenticated admin API under `/api/v1/admin` and
does not expose a public dashboard or account-registration flow.

## Local development

Build the UI once, then start the API from the workspace root:

```powershell
pnpm admin-ui:build
pnpm dev
```

Open `http://localhost:5000/admin`. The standalone Vite development server is
available with `pnpm admin-ui:dev` on port `5175`; its `/api` requests proxy to
the local API. Set `VITE_DEV_BACKEND_ORIGIN` when that API is on another local
origin.

`VITE_API_BASE_URL` is optional. When omitted, the deployed UI uses the current
origin and `/api/v1`, so the dashboard and API remain on one host.

The dashboard keeps the short-lived admin access token in browser session
storage and validates it against `/admin/auth/me` when the page loads. Admin
authentication remains enforced by the backend for every protected request.
