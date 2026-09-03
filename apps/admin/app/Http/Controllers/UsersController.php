<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\CentralApiException;
use App\Services\CentralApi;
use Illuminate\Http\Request;
use Illuminate\View\View;

final class UsersController extends Controller
{
    public function __construct(private readonly CentralApi $api)
    {
    }

    public function __invoke(Request $request): View
    {
        $data = [];
        $error = null;
        $token = (string) $request->session()->get('admin_access_token');

        try {
            $data = $this->api->users($token);
        } catch (CentralApiException $exception) {
            report($exception);
            $error = 'The central API is temporarily unavailable.';
        }

        $users = is_array($data['users'] ?? null) ? $data['users'] : [];

        return view('admin.users', compact('users', 'error'));
    }
}
