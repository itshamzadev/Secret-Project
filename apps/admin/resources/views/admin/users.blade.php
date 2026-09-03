@extends('admin.layouts.app')

@section('title', 'Users')

@section('content')
    @if ($error !== null)
        <div class="alert">{{ $error }}</div>
    @endif

    <section class="panel">
        <div class="panel-heading">
            <div>
                <p class="eyebrow">DIRECTORY</p>
                <h1>Users</h1>
                <p class="muted">Read-only operational view backed by the central API.</p>
            </div>
        </div>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Contact</th>
                        <th>Status</th>
                        <th>Last seen</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($users as $user)
                        @if (is_array($user))
                            <tr>
                                <td>
                                    <strong>{{ $user['displayName'] ?? '' }}</strong>
                                    <small>@{{ $user['username'] ?? '' }}</small>
                                </td>
                                <td>{{ $user['phone'] ?? $user['email'] ?? '—' }}</td>
                                <td><span class="badge">{{ $user['accountStatus'] ?? 'unknown' }}</span></td>
                                <td>{{ $user['lastSeenAt'] ?? 'Never' }}</td>
                            </tr>
                        @endif
                    @empty
                        <tr><td colspan="4" class="muted">No users matched the current view.</td></tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </section>
@endsection
