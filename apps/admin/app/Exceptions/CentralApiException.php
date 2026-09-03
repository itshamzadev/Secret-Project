<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;
use Throwable;

final class CentralApiException extends RuntimeException
{
    public function __construct(string $message, public readonly int $statusCode = 502, ?Throwable $previous = null)
    {
        parent::__construct($message, $statusCode, $previous);
    }
}
