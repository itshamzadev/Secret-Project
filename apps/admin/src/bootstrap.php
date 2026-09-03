<?php

declare(strict_types=1);

use Terqivo\Admin\ApiClient;
use Terqivo\Admin\Auth;

require_once __DIR__ . '/ApiException.php';
require_once __DIR__ . '/ApiClient.php';
require_once __DIR__ . '/Auth.php';

/** @var array{api_base_url: string, session_name: string, cookie_secure: bool} $config */
$config = require __DIR__ . '/config.php';

session_name($config['session_name']);
session_set_cookie_params([
    'httponly' => true,
    'secure' => $config['cookie_secure'],
    'samesite' => 'Lax',
    'path' => '/',
]);
session_start();

if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$apiClient = new ApiClient($config['api_base_url']);
$auth = new Auth($apiClient);

function admin_h(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function admin_csrf_token(): string
{
    return is_string($_SESSION['csrf_token'] ?? null) ? $_SESSION['csrf_token'] : '';
}

function admin_require_csrf(): void
{
    if (!hash_equals(admin_csrf_token(), is_string($_POST['csrf_token'] ?? null) ? $_POST['csrf_token'] : '')) {
        http_response_code(419);
        exit('Invalid request token.');
    }
}
