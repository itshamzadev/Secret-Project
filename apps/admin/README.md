# Terqivo Connect Admin Panel

Laravel 12 server-rendered administration panel for Terqivo Connect. The
panel does not connect directly to MongoDB. It authenticates with and reads
operational data from the central Node API configured by
`ADMIN_API_BASE_URL`.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Redirects to admin login |
| GET | `/login` | Login form |
| POST | `/login` | Authenticate through the central API |
| POST | `/logout` | Revoke the admin API session and clear the local session |
| GET | `/dashboard` | Platform overview |
| GET | `/users` | Read-only user directory |

The Laravel front controller is `public/index.php`. A root `index.php` and
root `.htaccess` are also included for cPanel installations where the domain
document root must be the admin project directory. The recommended and safer
cPanel document root remains `apps/admin/public`.

## Local setup

```powershell
cd apps/admin
composer install --no-dev --optimize-autoloader
Copy-Item .env.example .env
php artisan key:generate
php artisan serve --host=127.0.0.1 --port=8080
```

Open `http://127.0.0.1:8080/login`.

Set `ADMIN_API_BASE_URL` to the deployed Node API. Create the first central
administrator with the backend bootstrap command; admin credentials are never
stored in this project. In the production API container, run:

```bash
node apps/api/dist/modules/admin/admin.bootstrap.js
```

## cPanel deployment

Upload the full project outside the public directory when possible and set the
domain/subdomain document root to `apps/admin/public`. If cPanel requires the
project directory itself as the document root, use the included root
`index.php` and `.htaccess`; keep `.env`, `app`, `bootstrap`, `config`,
`routes`, `storage`, and `vendor` protected from direct access.

Use PHP 8.2 or newer, enable cURL, run `composer install --no-dev
--optimize-autoloader`, and create `.env` from `.env.example`. Use
`ADMIN_COOKIE_SECURE=true` when the admin domain is HTTPS.
