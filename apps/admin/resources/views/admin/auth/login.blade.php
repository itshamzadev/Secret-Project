<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Terqivo Admin — Sign in</title>
    <link rel="stylesheet" href="{{ asset('assets/admin.css') }}">
</head>
<body class="login-page">
    <main class="login-card">
        <div class="brand-mark">T</div>
        <p class="eyebrow">TERQIVO CONNECT</p>
        <h1>Admin control center</h1>
        <p class="muted">Sign in to manage the central platform.</p>

        @if ($errors->any())
            <div class="alert">{{ $errors->first() }}</div>
        @endif

        <form method="post" action="{{ route('admin.login.submit') }}">
            @csrf
            <label>
                Email
                <input type="email" name="email" value="{{ old('email') }}" autocomplete="username" required>
            </label>
            <label>
                Password
                <input type="password" name="password" autocomplete="current-password" required minlength="8">
            </label>
            <button type="submit">Sign in securely</button>
        </form>
    </main>
</body>
</html>
