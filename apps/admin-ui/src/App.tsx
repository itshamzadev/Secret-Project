import type {
  AdminDashboardDto,
  AdminUserListItemDto,
  AdminUserListResponse,
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
import { useEffect, useMemo, useState, type FormEvent } from "react";

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
  grid: "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z",
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

  const pageTitle = location.pathname.endsWith("/users") ? "Users" : "Overview";

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
                <th>Last seen</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td className="table-state" colSpan={5}>
                    Loading users…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td className="table-state" colSpan={5}>
                    No users match this view.
                  </td>
                </tr>
              ) : (
                users.map((user) => <UserRow key={user.id} user={user} />)
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
    </div>
  );
}

function UserRow({ user }: { user: AdminUserListItemDto }) {
  return (
    <tr>
      <td>
        <div className="user-cell">
          <span className="user-avatar">{initials(user.displayName)}</span>
          <span>
            <strong>{user.displayName}</strong>
            <small>@{user.username}</small>
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
      <td>{formatDate(user.lastSeenAt)}</td>
      <td>{formatDate(user.createdAt)}</td>
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
