@extends('admin.layouts.app')

@section('title', 'Dashboard')

@section('content')
    @if ($error !== null)
        <div class="alert">{{ $error }}</div>
    @endif

    @php
        $users = is_array($data['users'] ?? null) ? $data['users'] : [];
        $messages = is_array($data['messages'] ?? null) ? $data['messages'] : [];
        $calls = is_array($data['calls'] ?? null) ? $data['calls'] : [];
        $health = is_array($data['health'] ?? null) ? $data['health'] : [];
        $pushDevices = is_array($data['pushDevices'] ?? null) ? $data['pushDevices'] : [];
    @endphp

    <section class="hero">
        <div>
            <p class="eyebrow">OVERVIEW</p>
            <h1>Platform at a glance</h1>
            <p class="muted">Live aggregates from the central Node API.</p>
        </div>
        <span class="status-pill">API connected</span>
    </section>

    <div class="stats">
        <article>
            <small>Total users</small>
            <strong>{{ $users['total'] ?? '—' }}</strong>
            <span>{{ $users['online'] ?? '—' }} online</span>
        </article>
        <article>
            <small>Messages today</small>
            <strong>{{ $messages['today'] ?? '—' }}</strong>
            <span>{{ $messages['total'] ?? '—' }} all time</span>
        </article>
        <article>
            <small>Calls</small>
            <strong>{{ $calls['total'] ?? '—' }}</strong>
            <span>{{ $calls['missed'] ?? '—' }} missed</span>
        </article>
    </div>

    <section class="panel">
        <div class="panel-heading">
            <div>
                <p class="eyebrow">SYSTEM</p>
                <h2>Service health</h2>
            </div>
        </div>
        <div class="health-grid">
            <span>MongoDB <b>{{ $health['database'] ?? 'unknown' }}</b></span>
            <span>Redis <b>{{ $health['redis'] ?? 'unknown' }}</b></span>
            <span>Push devices <b>{{ $pushDevices['enabled'] ?? '—' }}</b></span>
        </div>
    </section>
@endsection
