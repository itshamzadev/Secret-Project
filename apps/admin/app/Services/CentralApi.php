<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\CentralApiException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Throwable;

final class CentralApi
{
    /** @param array<string, mixed>|null $payload */
    public function request(string $method, string $path, ?array $payload = null, ?string $token = null): array
    {
        $client = Http::baseUrl((string) config('terqivo.api_base_url'))
            ->acceptJson()
            ->timeout(15);

        if ($token !== null) {
            $client = $client->withToken($token);
        }

        try {
            $response = $this->send($client, $method, $path, $payload);
        } catch (Throwable $exception) {
            throw new CentralApiException('The central API is unavailable.', 502, $exception);
        }

        $decoded = $response->json();
        if (!$response->successful() || !is_array($decoded) || ($decoded['success'] ?? false) !== true) {
            throw new CentralApiException(
                'The central API request could not be completed.',
                $response->status() > 0 ? $response->status() : 502
            );
        }

        return $decoded;
    }

    /** @return array{accessToken: string, admin: array<string, mixed>} */
    public function login(string $email, string $password): array
    {
        $response = $this->request('POST', '/admin/auth/login', [
            'email' => $email,
            'password' => $password,
        ]);
        $data = $response['data'] ?? null;
        if (!is_array($data) || !is_string($data['accessToken'] ?? null) || !is_array($data['admin'] ?? null)) {
            throw new CentralApiException('The central API returned an incomplete admin session.', 502);
        }

        return [
            'accessToken' => $data['accessToken'],
            'admin' => $data['admin'],
        ];
    }

    public function logout(string $token): void
    {
        $this->request('POST', '/admin/auth/logout', null, $token);
    }

    /** @return array<string, mixed> */
    public function dashboard(string $token): array
    {
        return $this->data($this->request('GET', '/admin/dashboard', null, $token));
    }

    /** @return array<string, mixed> */
    public function users(string $token): array
    {
        return $this->data($this->request('GET', '/admin/users?limit=50', null, $token));
    }

    /** @return array<string, mixed> */
    private function data(array $response): array
    {
        $data = $response['data'] ?? [];
        return is_array($data) ? $data : [];
    }

    /** @param array<string, mixed>|null $payload */
    private function send(PendingRequest $client, string $method, string $path, ?array $payload): Response
    {
        return $client->send($method, $path, $payload === null ? [] : ['json' => $payload]);
    }
}
