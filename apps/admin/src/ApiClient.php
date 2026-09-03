<?php

declare(strict_types=1);

namespace Terqivo\Admin;

final class ApiClient
{
    public function __construct(private readonly string $baseUrl)
    {
    }

    /** @return array<string, mixed> */
    public function request(string $method, string $path, ?array $payload = null, ?string $token = null): array
    {
        $handle = curl_init($this->baseUrl . '/' . ltrim($path, '/'));
        if ($handle === false) {
            throw new ApiException('The central API client could not be initialized.');
        }

        $headers = ['Accept: application/json'];
        if ($payload !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        if ($token !== null) {
            $headers[] = 'Authorization: Bearer ' . $token;
        }

        curl_setopt_array($handle, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $payload === null ? null : json_encode($payload, JSON_THROW_ON_ERROR),
        ]);

        $response = curl_exec($handle);
        $statusCode = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($handle);
        curl_close($handle);

        if ($response === false) {
            throw new ApiException('The central API is unavailable.');
        }
        if ($curlError !== '') {
            throw new ApiException('The central API request failed.');
        }

        try {
            $decoded = json_decode($response, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiException('The central API returned an invalid response.', $statusCode ?: 502);
        }
        if (!is_array($decoded)) {
            throw new ApiException('The central API returned an invalid response.', $statusCode ?: 502);
        }

        if ($statusCode >= 400 || ($decoded['success'] ?? false) !== true) {
            $error = is_array($decoded['error'] ?? null) ? $decoded['error'] : [];
            $message = is_string($error['message'] ?? null) ? $error['message'] : 'The central API request failed.';
            $errorCode = is_string($error['code'] ?? null) ? $error['code'] : 'ADMIN_API_ERROR';
            throw new ApiException($message, $statusCode ?: 500, $errorCode);
        }

        return $decoded;
    }
}
