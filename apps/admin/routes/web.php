<?php

declare(strict_types=1);

use App\Http\Controllers\AdminAuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\UsersController;
use App\Http\Middleware\EnsureAdminAuthenticated;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => redirect()->route('admin.login'))->name('admin.home');

Route::get('/login', [AdminAuthController::class, 'showLogin'])->name('admin.login');
Route::post('/login', [AdminAuthController::class, 'login'])->name('admin.login.submit');

Route::middleware(EnsureAdminAuthenticated::class)->group(function (): void {
    Route::get('/dashboard', DashboardController::class)->name('admin.dashboard');
    Route::get('/users', UsersController::class)->name('admin.users');
    Route::post('/logout', [AdminAuthController::class, 'logout'])->name('admin.logout');
});
