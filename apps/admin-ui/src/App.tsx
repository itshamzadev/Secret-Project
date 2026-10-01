import type {
  AdminChannelListItemDto,
  AdminGroupListItemDto,
  AdminDashboardDto,
  AdminUserListItemDto,
  AdminUserListResponse,
  AdminReportDto,
  BadgeType,
} from "@terqivo/contracts";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { createContext, useContext, useEffect, useMemo, useState, type FormEvent } from "react";

import { AdminApiError, adminApi } from "./api";
import {
  clearAdminSession,
  loadAdminSession,
  saveAdminSession,
  type AdminSession,
} from "./auth";

type IconName =
  | "activity"
  | "arrow"
  | "check"
  | "chevron"
  | "grid"
  | "eye"
  | "eyeOff"
  | "flag"
  | "logout"
  | "menu"
  | "search"
  | "shield"
  | "users";

const iconPaths: Record<IconName, string> = {
  activity: "M3 12h4l2-8 4 16 2-8h6M3 12h1M20 12h1",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  check: "m5 12 4 4L19 6",
  chevron: "m9 18 6-6-6-6",
  eye: "M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  eyeOff: "m3 3 18 18M10.6 5.2A10.7 10.7 0 0 1 12 5c6 0 9.5 5 9.5 5a16.8 16.8 0 0 1-3.2 3.4M6.2 6.2C3.8 7.6 2.5 10 2.5 10s3.5 5 9.5 5c1.1 0 2.1-.2 3-.5",
  grid: "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z",
  flag: "M5 21V4m0 0c4-3 7 3 14 0v9c-7 3-10-3-14 0",
  logout:
    "M10 17l5-5-5-5m5 5H3m13-7V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2m13 12v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2",
  menu: "M4 6h16M4 12h16M4 18h16",
  search:
    "m20 20-4.35-4.35m2.1-5.15a7.25 7.25 0 1 1-14.5 0 7.25 7.25 0 0 1 14.5 0Z",
  shield: "M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Zm-3 9 2 2 4-4",
  users:
    "M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20m6-10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm5-6.5a3 3 0 0 1 0 5.8M17 14a4 4 0 0 1 3 3.8V20",
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={iconPaths[name]}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function initials(value: string): string {
  const result = value
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return result === "" ? "A" : result;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDate(value: string | null): string {
  if (value === null) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAppVersions(user: AdminUserListItemDto): string {
  if (user.appVersions.length === 0) return "Not reported";
  return user.appVersions
    .map((device) => {
      const version = device.version ?? "Unknown";
      const build = device.build === null ? "" : ` · ${device.build}`;
      return `${version}${build}`;
    })
    .join(", ");
}

const badgeOptions: Array<{ type: BadgeType; label: string }> = [
  { type: "verified", label: "Verified" },
  { type: "terqivo", label: "Terqivo" },
];

const CommunityBadgeContext = createContext<{
  busyId: string | null;
  setBadges: (id: string, badges: BadgeType[]) => void;
}>({
  busyId: null,
  setBadges: () => undefined,
});

function BadgeControls({
  badges,
  busy = false,
  onChange,
}: {
  badges?: BadgeType[] | undefined;
  busy?: boolean | undefined;
  onChange: (badges: BadgeType[]) => void;
}) {
  const selected = new Set(badges ?? []);
  return (
    <div className="badge-controls" aria-label="Account badges">
      {badgeOptions.map((option) => {
        const active = selected.has(option.type);
        return (
          <button
            aria-pressed={active}
            className={`badge-toggle badge-toggle-${option.type}${active ? " badge-toggle-active" : ""}`}
            disabled={busy}
            key={option.type}
            onClick={() => {
              const next = active
                ? (badges ?? []).filter((badge) => badge !== option.type)
                : [...(badges ?? []), option.type];
              onChange(next);
            }}
            title={`${active ? "Remove" : "Add"} ${option.label} badge`}
            type="button"
          >
            {option.type === "verified" ? "✓" : "T"} {option.label}
          </button>
        );
      })}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) return error.message;
  return "Something went wrong. Please try again.";
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="loading-mark">T</div>
      <p>Preparing secure administration…</p>
    </main>
  );
}

function LoginPage({
  onAuthenticated,
}: {
  onAuthenticated: (session: AdminSession) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.login({ email, password });
      const session: AdminSession = {
        admin: result.admin,
        accessToken: result.accessToken,
      };
      saveAdminSession(session);
      onAuthenticated(session);
      navigate("/dashboard", { replace: true });
    } catch (submitError: unknown) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-art" aria-label="Terqivo Connect administration">
        <div className="art-orb art-orb-one" />
        <div className="art-orb art-orb-two" />
        <div className="art-copy">
          <div className="brand-lockup brand-lockup-light">
            <span className="brand-symbol">T</span>
            <span>TERQIVO</span>
          </div>
          <p className="eyebrow light-eyebrow">CONNECT / CONTROL CENTER</p>
          <h1>Clarity for every conversation.</h1>
          <p>
            A focused view of the people, activity and infrastructure powering
            Terqivo Connect.
          </p>
        </div>
        <div className="art-footer">
          <span className="live-dot" />
          Central platform operations
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="mobile-brand brand-lockup">
            <span className="brand-symbol">T</span>
            <span>TERQIVO</span>
          </div>
          <span className="section-kicker">ADMINISTRATION</span>
          <h2>Welcome back</h2>
          <p className="auth-intro">
            Sign in to manage your platform securely.
          </p>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span>Email address</span>
              <input
                autoComplete="username"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@terqivo.com"
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                autoComplete="current-password"
                minLength={12}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {error !== null ? <p className="form-error">{error}</p> : null}
            <button
              className="primary-button full-width"
              disabled={busy}
              type="submit"
            >
              {busy ? "Signing in…" : "Sign in"}
              {busy ? null : <Icon name="arrow" size={17} />}
            </button>
          </form>
          <p className="security-note">
            <Icon name="shield" size={15} /> Admin access is protected by the
            central API.
          </p>
        </div>
      </section>
    </main>
  );
}

function AdminShell({
  session,
  onLogout,
}: {
  session: AdminSession;
  onLogout: () => void;
}) {
  const location = useLocation();
  const [logoutBusy, setLogoutBusy] = useState(false);
  const canViewUsers =
    session.admin.role === "super_admin" ||
    session.admin.permissions.includes("users.view");
  const canViewReports =
    session.admin.role === "super_admin" ||
    session.admin.permissions.includes("reports.view");

  const pageTitle = location.pathname.endsWith("/users")
    ? "Users"
    : location.pathname.endsWith("/groups")
      ? "Groups"
      : location.pathname.endsWith("/channels")
        ? "Channels"
    : location.pathname.endsWith("/reports")
      ? "Reports"
      : "Overview";

  async function logout(): Promise<void> {
    setLogoutBusy(true);
    await adminApi.logout(session.accessToken).catch(() => undefined);
    onLogout();
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-lockup">
            <span className="brand-symbol">T</span>
            <span>TERQIVO</span>
          </div>
          <div className="admin-label">CONTROL CENTER</div>
        </div>
        <nav aria-label="Admin navigation" className="side-nav">
          <span className="nav-heading">Workspace</span>
          <NavLink className="side-link" to="/dashboard">
            <Icon name="grid" />
            Overview
          </NavLink>
          {canViewUsers ? (
            <NavLink className="side-link" to="/users">
              <Icon name="users" />
              Users
            </NavLink>
          ) : null}
          {canViewUsers ? (
            <NavLink className="side-link" to="/groups">
              <Icon name="users" />
              Groups
            </NavLink>
          ) : null}
          {canViewUsers ? (
            <NavLink className="side-link" to="/channels">
              <Icon name="activity" />
              Channels
            </NavLink>
          ) : null}
          {canViewReports ? (
            <NavLink className="side-link" to="/reports">
              <Icon name="flag" />
              Reports
            </NavLink>
          ) : null}
        </nav>
        <div className="sidebar-bottom">
          <div className="platform-status">
            <span className="live-dot" />
            <span>
              <strong>Platform status</strong>
              <small>Connected to API</small>
            </span>
          </div>
          <div className="admin-profile">
            <span className="admin-avatar">
              {initials(session.admin.displayName)}
            </span>
            <span className="admin-profile-copy">
              <strong>{session.admin.displayName}</strong>
              <small>{session.admin.role.replace("_", " ")}</small>
            </span>
            <button
              aria-label="Sign out"
              className="icon-button subtle"
              disabled={logoutBusy}
              onClick={() => void logout()}
              title="Sign out"
              type="button"
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="breadcrumb">TERQIVO CONNECT / ADMIN</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-meta">
            <span className="secure-chip">
              <Icon name="shield" size={14} /> Secure session
            </span>
            <span className="topbar-avatar">
              {initials(session.admin.displayName)}
            </span>
          </div>
        </header>
        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: number;
  detail: string;
  accent: "blue" | "cyan" | "green" | "violet";
}) {
  return (
    <article className={`metric-card metric-${accent}`}>
      <div className="metric-topline">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon name="activity" size={16} />
        </span>
      </div>
      <strong>{formatNumber(value)}</strong>
      <small>{detail}</small>
    </article>
  );
}

function DashboardPage({ token }: { token: string }) {
  const [dashboard, setDashboard] = useState<AdminDashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void adminApi
      .dashboard(token)
      .then((result) => {
        if (active) {
          setDashboard(result);
          setError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (loading && dashboard === null) return <PageLoading />;
  if (error !== null && dashboard === null)
    return (
      <ErrorState message={error} onRetry={() => window.location.reload()} />
    );
  if (dashboard === null)
    return <ErrorState message="No dashboard data was returned." />;

  const healthItems = [
    { label: "Database", value: dashboard.health.database },
    { label: "Redis", value: dashboard.health.redis },
  ];

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <span className="section-kicker">PLATFORM PULSE</span>
          <h2>Good to see you.</h2>
          <p>Here’s a live snapshot of Terqivo Connect.</p>
        </div>
        <span className="last-updated">
          <span className="live-dot" /> Live data
        </span>
      </section>
      <section className="metrics-grid" aria-label="Platform metrics">
        <MetricCard
          accent="blue"
          detail="registered accounts"
          label="Total users"
          value={dashboard.users.total}
        />
        <MetricCard
          accent="cyan"
          detail="currently online"
          label="Online now"
          value={dashboard.users.online}
        />
        <MetricCard
          accent="violet"
          detail="across all conversations"
          label="Messages"
          value={dashboard.messages.total}
        />
        <MetricCard
          accent="green"
          detail="enabled devices"
          label="Push devices"
          value={dashboard.pushDevices.enabled}
        />
      </section>
      <section className="dashboard-grid">
        <article className="panel health-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">SYSTEM HEALTH</span>
              <h3>Services at a glance</h3>
            </div>
            <span className="panel-status">Operational</span>
          </div>
          <div className="health-list">
            {healthItems.map((item) => (
              <div className="health-row" key={item.label}>
                <span className="health-name">
                  <span className="health-icon">
                    <Icon
                      name={item.label === "Redis" ? "activity" : "shield"}
                      size={16}
                    />
                  </span>
                  {item.label}
                </span>
                <span className={`status-label status-${item.value}`}>
                  <span /> {item.value}
                </span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">ACTIVITY</span>
              <h3>What’s happening</h3>
            </div>
          </div>
          <div className="activity-list">
            <ActivityRow
              label="Messages today"
              value={dashboard.messages.today}
            />
            <ActivityRow
              label="Active accounts"
              value={dashboard.users.active}
            />
            <ActivityRow
              label="Conversations"
              value={dashboard.conversations.total}
            />
            <ActivityRow label="Calls recorded" value={dashboard.calls.total} />
          </div>
        </article>
      </section>
      <section className="summary-strip">
        <div>
          <span className="summary-icon">
            <Icon name="users" size={19} />
          </span>
          <span>
            <strong>Account health</strong>
            <small>
              {formatNumber(dashboard.users.suspended)} suspended ·{" "}
              {formatNumber(dashboard.users.disabled)} disabled
            </small>
          </span>
        </div>
        <div>
          <span className="summary-icon summary-icon-warm">
            <Icon name="activity" size={19} />
          </span>
          <span>
            <strong>Call overview</strong>
            <small>
              {formatNumber(dashboard.calls.missed)} missed calls recorded
            </small>
          </span>
        </div>
        <div>
          <span className="summary-icon summary-icon-blue">
            <Icon name="grid" size={19} />
          </span>
          <span>
            <strong>API uptime</strong>
            <small>
              {Math.floor(dashboard.health.uptime / 3600)}h{" "}
              {Math.floor((dashboard.health.uptime % 3600) / 60)}m since start
            </small>
          </span>
        </div>
      </section>
    </div>
  );
}

function ActivityRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="activity-row">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function UsersPage({ token }: { token: string }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<
    AdminUserListItemDto["accountStatus"] | "all"
  >("all");
  const [pages, setPages] = useState<AdminUserListResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUserListItemDto | null>(
    null,
  );
  const [actionBusyUserId, setActionBusyUserId] = useState<string | null>(null);

  async function loadUsers(cursor?: string): Promise<void> {
    setLoading(true);
    try {
      const query: { search?: string; status?: string; cursor?: string } = {
        search,
        status,
      };
      if (cursor !== undefined) query.cursor = cursor;
      const result = await adminApi.users(token, query);
      setPages((current) =>
        cursor === undefined ? [result] : [...current, result],
      );
      setError(null);
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    // The explicit search action below controls when a new query is sent.
    // Status changes are intentionally applied immediately.
  }, [status, token]);

  const users = useMemo(() => pages.flatMap((page) => page.users), [pages]);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;

  async function setUserStatus(
    user: AdminUserListItemDto,
    nextStatus: "active" | "suspended",
  ): Promise<void> {
    const action = nextStatus === "suspended" ? "suspend" : "restore";
    if (
      !window.confirm(
        `${action[0]?.toUpperCase()}${action.slice(1)} @${user.username}?`,
      )
    ) {
      return;
    }
    setActionBusyUserId(user.id);
    setError(null);
    try {
      await adminApi.setUserStatus(token, user.id, nextStatus);
      await loadUsers();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setActionBusyUserId(null);
    }
  }

  async function deleteUser(user: AdminUserListItemDto): Promise<void> {
    if (
      !window.confirm(
        `Delete @${user.username}? The account will be disabled and all active sessions will be signed out.`,
      )
    ) {
      return;
    }
    setActionBusyUserId(user.id);
    setError(null);
    try {
      await adminApi.deleteUser(token, user.id);
      await loadUsers();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setActionBusyUserId(null);
    }
  }

  async function setUserTier(
    user: AdminUserListItemDto,
    userTier: AdminUserListItemDto["userTier"],
  ): Promise<void> {
    if (userTier === user.userTier) return;
    setActionBusyUserId(user.id);
    setError(null);
    try {
      await adminApi.setUserTier(token, user.id, userTier);
      await loadUsers();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setActionBusyUserId(null);
    }
  }

  async function setUserBadges(
    user: AdminUserListItemDto,
    badges: BadgeType[],
  ): Promise<void> {
    setActionBusyUserId(user.id);
    setError(null);
    try {
      await adminApi.setUserBadges(token, user.id, badges);
      await loadUsers();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setActionBusyUserId(null);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPages([]);
    void adminApi
      .users(token, { search: searchInput.trim(), status })
      .then((result) => {
        setPages([result]);
        setError(null);
      })
      .catch((requestError: unknown) => setError(errorMessage(requestError)))
      .finally(() => setLoading(false));
  }

  return (
    <div className="page-stack">
      <section className="welcome-row compact-welcome">
        <div>
          <span className="section-kicker">DIRECTORY</span>
          <h2>People on Terqivo.</h2>
          <p>Review account status and recent activity.</p>
        </div>
        <span className="count-chip">{formatNumber(users.length)} shown</span>
      </section>
      <section className="panel directory-panel">
        <div className="directory-toolbar">
          <form
            className="directory-search"
            onSubmit={(event) => submitSearch(event)}
          >
            <Icon name="search" size={18} />
            <input
              aria-label="Search users"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name, username or email"
              value={searchInput}
            />
            <button type="submit">Search</button>
          </form>
          <label className="status-filter">
            <span>Status</span>
            <select
              aria-label="Filter by account status"
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPages([]);
              }}
              value={status}
            >
              <option value="all">All accounts</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
        </div>
        {error !== null ? <div className="inline-error">{error}</div> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Account type</th>
                <th>User tier</th>
                <th>App version</th>
                <th>Last seen</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td className="table-state" colSpan={9}>
                    Loading users…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td className="table-state" colSpan={9}>
                    No users match this view.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <UserRow
                    busy={actionBusyUserId === user.id}
                    key={user.id}
                    onDelete={() => void deleteUser(user)}
                    onPassword={() => setPasswordUser(user)}
                    onStatus={() =>
                      void setUserStatus(
                        user,
                        user.accountStatus === "suspended"
                          ? "active"
                          : "suspended",
                      )
                    }
                    onTier={(tier) => void setUserTier(user, tier)}
                    onBadges={(badges) => void setUserBadges(user, badges)}
                    token={token}
                    user={user}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        {nextCursor !== null ? (
          <div className="table-footer">
            <button
              className="secondary-button"
              disabled={loading}
              onClick={() => void loadUsers(nextCursor)}
              type="button"
            >
              {loading ? "Loading…" : "Load more"}
              <Icon name="chevron" size={15} />
            </button>
          </div>
        ) : null}
      </section>
      {passwordUser !== null ? (
        <PasswordChangeDialog
          onClose={() => setPasswordUser(null)}
          onSaved={() => {
            setPasswordUser(null);
            void loadUsers();
          }}
          token={token}
          user={passwordUser}
        />
      ) : null}
    </div>
  );
}

function UserAvatar({
  token,
  user,
}: {
  token: string;
  user: AdminUserListItemDto;
}) {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    if (user.avatarUrl === null) {
      setSource(null);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    void adminApi
      .userAvatar(token, user.id, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSource(null);
      });

    return () => {
      controller.abort();
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [token, user.avatarUrl, user.id]);

  if (source !== null) {
    return (
      <img
        alt={`${user.displayName} profile`}
        className="user-avatar user-avatar-image"
        src={source}
      />
    );
  }
  return <span className="user-avatar">{initials(user.displayName)}</span>;
}

function UserRow({
  user,
  busy,
  token,
  onPassword,
  onStatus,
  onTier,
  onBadges,
  onDelete,
}: {
  user: AdminUserListItemDto;
  busy: boolean;
  token: string;
  onPassword: () => void;
  onStatus: () => void;
  onTier: (tier: AdminUserListItemDto["userTier"]) => void;
  onBadges: (badges: BadgeType[]) => void;
  onDelete: () => void;
}) {
  return (
    <tr>
      <td>
        <div className="user-cell">
          <UserAvatar token={token} user={user} />
          <span>
            <strong>{user.displayName}</strong>
            <small>@{user.username}</small>
            <BadgeControls badges={user.badges} busy={busy} onChange={onBadges} />
          </span>
        </div>
      </td>
      <td>
        <span className="contact-cell">
          {user.email ?? user.phone ?? "No contact added"}
        </span>
      </td>
      <td>
        <span className={`account-status account-${user.accountStatus}`}>
          {user.accountStatus}
        </span>
      </td>
      <td>{user.accountType}</td>
      <td>
        <select
          aria-label={`Set tier for ${user.username}`}
          className="table-action"
          disabled={busy}
          onChange={(event) =>
            onTier(event.target.value as AdminUserListItemDto["userTier"])
          }
          value={user.userTier}
        >
          <option value="normal">Normal</option>
          <option value="special">Special</option>
          <option value="special_pro">Special pro</option>
          <option value="ultra_special">Ultra special</option>
        </select>
      </td>
      <td>
        <span className="version-cell" title={formatAppVersions(user)}>
          {formatAppVersions(user)}
        </span>
      </td>
      <td>{formatDate(user.lastSeenAt)}</td>
      <td>{formatDate(user.createdAt)}</td>
      <td>
        <div className="user-actions">
          <button
            className="table-action"
            disabled={busy}
            onClick={onPassword}
            type="button"
          >
            Change password
          </button>
          <button
            className="table-action"
            disabled={busy || user.accountStatus === "disabled"}
            onClick={onStatus}
            type="button"
          >
            {user.accountStatus === "suspended" ? "Restore" : "Suspend"}
          </button>
          <button
            className="table-action table-action-danger"
            disabled={busy || user.accountStatus === "disabled"}
            onClick={onDelete}
            type="button"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

function PasswordChangeDialog({
  token,
  user,
  onClose,
  onSaved,
}: {
  token: string;
  user: AdminUserListItemDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminApi.changeUserPassword(token, user.id, password);
      onSaved();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="password-dialog-title"
        className="dialog-card"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <span className="section-kicker">ACCOUNT SECURITY</span>
            <h3 id="password-dialog-title">Change password</h3>
            <p>
              @{user.username} will need to sign in again on active devices.
            </p>
            <p className="security-note">
              The current password cannot be viewed. It is stored as a one-way
              Argon2id hash; set a new password here instead.
            </p>
          </div>
          <button
            aria-label="Close"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>New password</span>
            <span className="password-input-wrap">
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide new password" : "Show new password"}
                className="password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={17} />
              </button>
            </span>
          </label>
          <label>
            <span>Confirm password</span>
            <span className="password-input-wrap">
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                type={showConfirmation ? "text" : "password"}
                value={confirmation}
              />
              <button
                aria-label={showConfirmation ? "Hide password confirmation" : "Show password confirmation"}
                className="password-toggle"
                onClick={() => setShowConfirmation((visible) => !visible)}
                type="button"
              >
                <Icon name={showConfirmation ? "eyeOff" : "eye"} size={17} />
              </button>
            </span>
          </label>
          {error !== null ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "Saving…" : "Save password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CommunitiesPage({
  kind,
  token,
}: {
  kind: "groups" | "channels";
  token: string;
}) {
  const [groups, setGroups] = useState<AdminGroupListItemDto[]>([]);
  const [channels, setChannels] = useState<AdminChannelListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      if (kind === "groups") {
        const result = await adminApi.groups(token);
        setGroups(result.groups);
      } else {
        const result = await adminApi.channels(token);
        setChannels(result.channels);
      }
      setError(null);
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [kind, token]);

  async function setCommunityBadges(id: string, badges: BadgeType[]): Promise<void> {
    setActionBusyId(id);
    setError(null);
    try {
      if (kind === "groups") await adminApi.setGroupBadges(token, id, badges);
      else await adminApi.setChannelBadges(token, id, badges);
      await load();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setActionBusyId(null);
    }
  }

  const title = kind === "groups" ? "Groups across the platform." : "Channels across the platform.";
  const description = kind === "groups"
    ? "Review ownership, admins and every current member."
    : "Review channel ownership, follower membership and the latest post.";

  return (
    <CommunityBadgeContext.Provider
      value={{ busyId: actionBusyId, setBadges: (id, badges) => void setCommunityBadges(id, badges) }}
    >
    <div className="page-stack">
      <section className="welcome-row compact-welcome">
        <div>
          <span className="section-kicker">COMMUNITIES</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="count-chip">
          {formatNumber(kind === "groups" ? groups.length : channels.length)} shown
        </span>
      </section>
      <section className="panel directory-panel">
        <div className="directory-toolbar">
          <span className="contact-cell">
            {kind === "groups" ? "Owner · admins/members · joined count" : "Owner · followers · latest post"}
          </span>
          <button className="secondary-button" disabled={loading} onClick={() => void load()} type="button">
            Refresh
          </button>
        </div>
        {error !== null ? <div className="inline-error">{error}</div> : null}
        <div className="table-wrap">
          {kind === "groups" ? (
            <table>
              <thead><tr><th>Group</th><th>Owner</th><th>Members</th><th>Joined users</th><th>Updated</th></tr></thead>
              <tbody>
                {loading && groups.length === 0 ? <tr><td className="table-state" colSpan={5}>Loading groups…</td></tr> : groups.length === 0 ? <tr><td className="table-state" colSpan={5}>No groups yet.</td></tr> : groups.map((group) => <AdminGroupRow group={group} key={group.id} />)}
              </tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th>Channel</th><th>Owner</th><th>Followers</th><th>Joined users</th><th>Latest post</th><th>Updated</th></tr></thead>
              <tbody>
                {loading && channels.length === 0 ? <tr><td className="table-state" colSpan={6}>Loading channels…</td></tr> : channels.length === 0 ? <tr><td className="table-state" colSpan={6}>No channels yet.</td></tr> : channels.map((channel) => <AdminChannelRow channel={channel} key={channel.id} />)}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
    </CommunityBadgeContext.Provider>
  );
}

function AdminGroupRow({ group }: { group: AdminGroupListItemDto }) {
  const { busyId, setBadges } = useContext(CommunityBadgeContext);
  return (
    <tr>
      <td><strong>{group.name}</strong><small>{group.description || "No description"}</small><BadgeControls badges={group.badges} busy={busyId === group.id} onChange={(badges) => setBadges(group.id, badges)} /></td>
      <td>
        <strong>{group.owner === null ? "Unknown" : `@${group.owner.username}`}</strong>
        <small>Admins: {formatPeople(group.admins)}</small>
      </td>
      <td><span className="account-status account-active">{group.memberCount}</span></td>
      <td><span className="contact-cell">{formatPeople(group.members)}</span></td>
      <td>{formatDate(group.updatedAt)}</td>
    </tr>
  );
}

function AdminChannelRow({ channel }: { channel: AdminChannelListItemDto }) {
  const { busyId, setBadges } = useContext(CommunityBadgeContext);
  return (
    <tr>
      <td><strong>{channel.name}</strong><small>@{channel.handle}</small><BadgeControls badges={channel.badges} busy={busyId === channel.id} onChange={(badges) => setBadges(channel.id, badges)} /></td>
      <td>{channel.owner === null ? "Unknown" : `@${channel.owner.username}`}</td>
      <td><span className="account-status account-active">{channel.followerCount}</span></td>
      <td><span className="contact-cell">{formatPeople(channel.followers)}</span></td>
      <td><span className="contact-cell">{channel.latestPost?.text ?? "No posts yet"}</span></td>
      <td>{formatDate(channel.updatedAt)}</td>
    </tr>
  );
}

function formatPeople(people: Array<{ username: string }>): string {
  if (people.length === 0) return "None";
  const visible = people.slice(0, 4).map((person) => `@${person.username}`);
  return people.length > visible.length ? `${visible.join(", ")} +${people.length - visible.length}` : visible.join(", ");
}

function ReportsPage({ token }: { token: string }) {
  const [status, setStatus] = useState<
    "open" | "resolved" | "dismissed" | "all"
  >("open");
  const [reports, setReports] = useState<AdminReportDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadReports(): Promise<void> {
    setLoading(true);
    try {
      const result = await adminApi.reports(
        token,
        status === "all" ? undefined : status,
      );
      setReports(result.reports);
      setError(null);
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReports();
  }, [status, token]);

  async function updateReport(
    report: AdminReportDto,
    nextStatus: "resolved" | "dismissed",
  ): Promise<void> {
    setBusyId(report.id);
    setError(null);
    try {
      await adminApi.updateReport(token, report.id, nextStatus);
      await loadReports();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
      setBusyId(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-stack">
      <section className="welcome-row compact-welcome">
        <div>
          <span className="section-kicker">MODERATION</span>
          <h2>Reports from the community.</h2>
          <p>Review who reported what, then resolve or dismiss each case.</p>
        </div>
        <span className="count-chip">{formatNumber(reports.length)} shown</span>
      </section>
      <section className="panel directory-panel">
        <div className="directory-toolbar">
          <label className="status-filter">
            <span>Status</span>
            <select
              aria-label="Filter reports"
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
              value={status}
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All reports</option>
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={loading}
            onClick={() => void loadReports()}
            type="button"
          >
            Refresh
          </button>
        </div>
        {error !== null ? <div className="inline-error">{error}</div> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reporter</th>
                <th>Reported account</th>
                <th>Reason</th>
                <th>Context</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && reports.length === 0 ? (
                <tr>
                  <td className="table-state" colSpan={6}>
                    Loading reports…
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td className="table-state" colSpan={6}>
                    No reports in this view.
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <ReportRow
                    busy={busyId === report.id}
                    key={report.id}
                    onDismiss={() => void updateReport(report, "dismissed")}
                    onResolve={() => void updateReport(report, "resolved")}
                    report={report}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReportRow({
  report,
  busy,
  onResolve,
  onDismiss,
}: {
  report: AdminReportDto;
  busy: boolean;
  onResolve: () => void;
  onDismiss: () => void;
}) {
  const context =
    report.messageId !== null
      ? "Message"
      : report.conversationId !== null
        ? "Conversation"
        : report.targetType;
  return (
    <tr>
      <td>
        <div className="user-cell">
          <span className="user-avatar">
            {initials(report.reporter.displayName)}
          </span>
          <span>
            <strong>{report.reporter.displayName}</strong>
            <small>@{report.reporter.username}</small>
          </span>
        </div>
      </td>
      <td>
        {report.targetUser === null ? (
          "—"
        ) : (
          <span className="user-cell">
            <span>
              <strong>{report.targetUser.displayName}</strong>
              <small>@{report.targetUser.username}</small>
            </span>
          </span>
        )}
      </td>
      <td>
        <span className="account-status account-suspended">
          {report.reason}
        </span>
      </td>
      <td>
        <span className="contact-cell">
          {context}
          {report.details === null ? "" : ` · ${report.details}`}
        </span>
      </td>
      <td>{formatDate(report.createdAt)}</td>
      <td>
        <div className="user-actions">
          {report.status === "open" ? (
            <>
              <button
                className="table-action"
                disabled={busy}
                onClick={onResolve}
                type="button"
              >
                Resolve
              </button>
              <button
                className="table-action table-action-danger"
                disabled={busy}
                onClick={onDismiss}
                type="button"
              >
                Dismiss
              </button>
            </>
          ) : (
            <span className="contact-cell">{report.status}</span>
          )}
        </div>
      </td>
    </tr>
  );
}

function PageLoading() {
  return (
    <div className="page-stack">
      <div className="skeleton-heading" />
      <div className="metrics-grid">
        {[1, 2, 3, 4].map((item) => (
          <div className="metric-card skeleton-card" key={item} />
        ))}
      </div>
      <div className="panel skeleton-panel" />
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-card">
      <span className="state-icon">
        <Icon name="shield" size={22} />
      </span>
      <h2>Couldn’t load this view</h2>
      <p>{message}</p>
      {onRetry !== undefined ? (
        <button className="primary-button" onClick={onRetry} type="button">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const stored = loadAdminSession();
    if (stored === null) {
      setBooting(false);
      return;
    }

    void adminApi
      .me(stored.accessToken)
      .then(({ admin }) => {
        const restored = { ...stored, admin };
        saveAdminSession(restored);
        setSession(restored);
      })
      .catch(() => {
        clearAdminSession();
        setSession(null);
      })
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <LoadingScreen />;

  return (
    <Routes>
      <Route
        element={
          session === null ? (
            <LoginPage onAuthenticated={setSession} />
          ) : (
            <Navigate replace to="/dashboard" />
          )
        }
        path="/login"
      />
      <Route
        path="/"
        element={
          <Navigate replace to={session === null ? "/login" : "/dashboard"} />
        }
      />
      <Route
        element={
          session === null ? (
            <Navigate replace to="/login" />
          ) : (
            <AdminShell
              onLogout={() => {
                clearAdminSession();
                setSession(null);
              }}
              session={session}
            />
          )
        }
      >
        <Route
          element={<DashboardPage token={session?.accessToken ?? ""} />}
          path="/dashboard"
        />
        <Route
          element={<UsersPage token={session?.accessToken ?? ""} />}
          path="/users"
        />
        <Route
          element={<CommunitiesPage kind="groups" token={session?.accessToken ?? ""} />}
          path="/groups"
        />
        <Route
          element={<CommunitiesPage kind="channels" token={session?.accessToken ?? ""} />}
          path="/channels"
        />
        <Route
          element={<ReportsPage token={session?.accessToken ?? ""} />}
          path="/reports"
        />
      </Route>
      <Route
        path="*"
        element={
          <Navigate replace to={session === null ? "/login" : "/dashboard"} />
        }
      />
    </Routes>
  );
}
