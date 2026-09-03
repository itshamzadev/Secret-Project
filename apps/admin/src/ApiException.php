<?php

declare(strict_types=1);

namespace Terqivo\Admin;

use RuntimeException;

final class ApiException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $statusCode = 500,
        public readonly string $errorCode = 'ADMIN_API_ERROR',
    ) {
        parent::__construct($message);
    }
}
