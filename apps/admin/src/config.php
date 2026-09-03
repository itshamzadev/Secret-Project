<?php

declare(strict_types=1);

function admin_env(string $key, string $default): string
{
    $value = getenv($key);
    return $value === false || trim($value) === '' ? $default : trim($value);
}

function admin_load_dotenv(): void
{
    $path = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
    if (!is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if ($key === '' || getenv($key) !== false) {
            continue;
        }
        if (strlen($value) >= 2 && (($value[0] === '"' && $value[-1] === '"') || ($value[0] === "'" && $value[-1] === "'"))) {
            $value = substr($value, 1, -1);
        }
        putenv($key . '=' . $value);
    }
}

admin_load_dotenv();

return [
    'api_base_url' => rtrim(admin_env('ADMIN_API_BASE_URL', 'http://127.0.0.1:5000/api/v1'), '/'),
    'session_name' => admin_env('ADMIN_SESSION_NAME', 'terqivo_admin'),
    'cookie_secure' => filter_var(admin_env('ADMIN_COOKIE_SECURE', 'false'), FILTER_VALIDATE_BOOLEAN),
];
