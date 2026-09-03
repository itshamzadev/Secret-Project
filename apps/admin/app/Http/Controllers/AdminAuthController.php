<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\CentralApiException;
use App\Services\CentralApi;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Illuminate\Validation\ValidationException;

final class AdminAuthController extends Controller
{
    public function __construct(private readonly CentralApi $api)
    {
    }

    public function showLogin(Request $request): View|RedirectResponse
    {
        if (is_string($request->session()->get('admin_access_token'))) {
            return redirect()->route('admin.dashboard');
        }

        return view('admin.auth.login');
    }

    public function login(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:254'],
            'password' => ['required', 'string', 'min:8', 'max:4096'],
        ]);

        try {
            $session = $this->api->login((string) $validated['email'], (string) $validated['password']);
        } catch (CentralApiException $exception) {
            report($exception);
            throw ValidationException::withMessages([
                'email' => 'Invalid administrator credentials.',
            ]);
        }

        $request->session()->regenerate();
        $request->session()->put([
            'admin_access_token' => $session['accessToken'],
            'admin' => $session['admin'],
        ]);

        return redirect()->route('admin.dashboard');
    }

    public function logout(Request $request): RedirectResponse
    {
        $token = $request->session()->get('admin_access_token');
        if (is_string($token)) {
            try {
                $this->api->logout($token);
            } catch (CentralApiException $exception) {
                report($exception);
            }
        }

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('admin.login');
    }
}
