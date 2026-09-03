<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Terqivo Admin — @yield('title', 'Dashboard')</title>
    <link rel="stylesheet" href="{{ asset('assets/admin.css') }}">
</head>
<body>
    @php($admin = is_array(session('admin')) ? session('admin') : [])
    <div class="layout">
        <aside>
            <div class="brand">
                <span class="brand-mark small">T</span>
                <strong>Terqivo</strong>
            </div>
            <p class="eyebrow">ADMIN CONSOLE</p>
            <nav>
                <a href="{{ route('admin.dashboard') }}">Overview</a>
                <a href="{{ route('admin.users') }}">Users</a>
            </nav>
            <div class="admin-account">
                <strong>{{ $admin['displayName'] ?? 'Administrator' }}</strong>
                <small>{{ $admin['email'] ?? '' }}</small>
                <form method="post" action="{{ route('admin.logout') }}">
                    @csrf
                    <button type="submit" class="link-button">Sign out</button>
                </form>
            </div>
        </aside>
        <main class="main">
            <header>
                <div>
                    <p class="eyebrow">TERQIVO CONNECT</p>
                    <h2>@yield('title', 'Dashboard')</h2>
                </div>
                <span class="status-pill">Central API</span>
            </header>
            @yield('content')
        </main>
    </div>
</body>
</html>
