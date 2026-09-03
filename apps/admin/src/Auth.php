<?php

declare(strict_types=1);

namespace Terqivo\Admin;

final class Auth
{
    public function __construct(private readonly ApiClient $api)
    {
    }

    public function token(): ?string
    {
        $token = $_SESSION['admin_access_token'] ?? null;
        return is_string($token) && $token !== '' ? $token : null;
    }

    /** @return array<string, mixed> */
    public function admin(): array
    {
        $admin = $_SESSION['admin'] ?? [];
        return is_array($admin) ? $admin : [];
    }

    public function login(string $email, string $password): void
    {
        $response = $this->api->request('POST', '/admin/auth/login', [
            'email' => $email,
            'password' => $password,
        ]);
        $data = is_array($response['data'] ?? null) ? $response['data'] : [];
        $token = $data['accessToken'] ?? null;
        $admin = $data['admin'] ?? null;
        if (!is_string($token) || !is_array($admin)) {
            throw new ApiException('The central API returned an incomplete admin session.', 502);
        }

        session_regenerate_id(true);
        $_SESSION['admin_access_token'] = $token;
        $_SESSION['admin'] = $admin;
    }

    public function logout(): void
    {
        $token = $this->token();
        if ($token !== null) {
            try {
                $this->api->request('POST', '/admin/auth/logout', null, $token);
            } catch (ApiException) {
                // Local session invalidation must work even if the API is unavailable.
            }
        }
        $_SESSION = [];
        if (ini_get('session.use_cookies') === '1') {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool) $params['secure'], (bool) $params['httponly']);
        }
        session_destroy();
    }
}
