<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureAdminAuthenticated
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!is_string($request->session()->get('admin_access_token'))) {
            return redirect()->route('admin.login');
        }

        return $next($request);
    }
}
