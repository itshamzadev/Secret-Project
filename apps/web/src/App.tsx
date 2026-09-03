import type {
  ContactDto,
  ConversationDto,
  MessageDto,
  PresenceEvent,
} from "@terqivo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { ApiClientError } from "@terqivo/api-client";

import { api, realtime } from "./api";

type User = Awaited<ReturnType<typeof api.me>>;
type View = "chats" | "contacts" | "profile";

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : "Something went wrong. Please try again.";
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ name, online = false }: { name: string; online?: boolean }) {
  return (
    <span className="avatar" aria-label={`${name} avatar`}>
      {initials(name)}
      {online ? <span className="presence-dot" /> : null}
    </span>
  );
}

function LoadingScreen() {
  return <main className="center-state">Restoring your secure session…</main>;
}

function LoginPage({
  onAuthenticated,
}: {
  onAuthenticated: (user: User) => void;
}) {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.login({
        identifier,
        password,
        platform: "web",
        deviceName: "Web browser",
      });
      onAuthenticated(result.user);
      navigate("/app/chats");
    } catch (submitError: unknown) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">T</div>
        <p className="eyebrow">TERQIVO CONNECT</p>
        <h1>Welcome back</h1>
        <p className="muted">One secure account across every device.</p>
        <form onSubmit={submit} className="stack-form">
          <label>
            Email, username or phone
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Securing…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("chats");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presence, setPresence] = useState<Record<string, PresenceEvent>>({});
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
  });
  const contacts = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api.listContacts(),
  });

  useEffect(() => {
    realtime.connect();
    const removeMessage = realtime.onMessage(({ message }) => {
      queryClient.setQueryData<{
        messages: MessageDto[];
        nextCursor: string | null;
      }>(["messages", message.conversationId], (current) => {
        if (current?.messages.some((item) => item.id === message.id))
          return current;
        return current === undefined
          ? { messages: [message], nextCursor: null }
          : { ...current, messages: [...current.messages, message] };
      });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
    const removePresence = realtime.onPresence((event) =>
      setPresence((current) => ({ ...current, [event.userId]: event })),
    );
    const removeTyping = realtime.onTyping((event, isTyping) =>
      setTyping((current) => ({
        ...current,
        [event.conversationId]: isTyping,
      })),
    );
    return () => {
      removeMessage();
      removePresence();
      removeTyping();
      realtime.disconnect();
    };
  }, [queryClient]);

  const list = conversations.data?.conversations ?? [];
  const selected =
    list.find((conversation) => conversation.id === selectedId) ??
    list[0] ??
    null;

  useEffect(() => {
    if (selected !== null && selectedId === null) setSelectedId(selected.id);
  }, [selected, selectedId]);

  async function logout(): Promise<void> {
    await api.logout().catch(() => undefined);
    realtime.disconnect();
    onLogout();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-lockup">
            <span className="brand-mark small">T</span>
            <span>Terqivo</span>
          </div>
          <span className="status-pill">
            <i /> Live
          </span>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button
            className={view === "chats" ? "nav-item active" : "nav-item"}
            onClick={() => setView("chats")}
          >
            ⌁ <span>Chats</span>
          </button>
          <button
            className={view === "contacts" ? "nav-item active" : "nav-item"}
            onClick={() => setView("contacts")}
          >
            ◎ <span>Contacts</span>
          </button>
          <button
            className={view === "profile" ? "nav-item active" : "nav-item"}
            onClick={() => setView("profile")}
          >
            ◌ <span>Profile</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <Avatar name={user.displayName} />
          <div className="account-label">
            <strong>{user.displayName}</strong>
            <span>@{user.username}</span>
          </div>
          <button
            className="icon-button"
            onClick={() => void logout()}
            aria-label="Log out"
          >
            ↗
          </button>
        </div>
      </aside>
      {view === "chats" ? (
        <ChatWorkspace
          conversations={list}
          selected={selected}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          presence={presence}
          typing={typing}
          isLoading={conversations.isLoading}
          error={conversations.error}
        />
      ) : null}
      {view === "contacts" ? (
        <ContactsWorkspace
          contacts={contacts.data?.contacts ?? []}
          isLoading={contacts.isLoading}
          onOpen={async (contact) => {
            const conversation = await api.createDirectConversation(
              contact.contactUser.id,
            );
            await queryClient.invalidateQueries({
              queryKey: ["conversations"],
            });
            setView("chats");
            setSelectedId(conversation.id);
          }}
        />
      ) : null}
      {view === "profile" ? (
        <ProfileWorkspace user={user} onLogout={() => void logout()} />
      ) : null}
    </div>
  );
}

function ChatWorkspace({
  conversations,
  selected,
  selectedId,
  setSelectedId,
  presence,
  typing,
  isLoading,
  error,
}: {
  conversations: ConversationDto[];
  selected: ConversationDto | null;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  presence: Record<string, PresenceEvent>;
  typing: Record<string, boolean>;
  isLoading: boolean;
  error: Error | null;
}) {
  return (
    <section className="workspace-pane">
      <div className="content-header">
        <div>
          <p className="eyebrow">MESSAGING</p>
          <h2>Conversations</h2>
        </div>
        <button className="round-button" aria-label="New conversation">
          +
        </button>
      </div>
      <div className="content-grid">
        <section className="conversation-list-panel">
          <div className="search-box">
            ⌕{" "}
            <input
              placeholder="Search conversations"
              aria-label="Search conversations"
            />
          </div>
          {isLoading ? (
            <div className="skeleton-list">
              <span />
              <span />
              <span />
            </div>
          ) : error ? (
            <div className="empty-state">
              <strong>Couldn’t load chats</strong>
              <span>Check your connection and try again.</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="empty-state">
              <strong>No conversations yet</strong>
              <span>Start with someone from Contacts.</span>
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                className={
                  conversation.id === (selectedId ?? selected?.id)
                    ? "conversation-row selected"
                    : "conversation-row"
                }
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
              >
                <Avatar
                  name={
                    conversation.participant.customName ??
                    conversation.participant.user.displayName
                  }
                  online={
                    presence[conversation.participant.user.id]?.isOnline ??
                    false
                  }
                />
                <span className="conversation-copy">
                  <strong>
                    {conversation.participant.customName ??
                      conversation.participant.user.displayName}
                  </strong>
                  <span>
                    {conversation.lastMessage?.text ?? "Start a conversation"}
                  </span>
                </span>
                <span className="conversation-meta">
                  <time>
                    {conversation.lastMessageAt
                      ? new Date(conversation.lastMessageAt).toLocaleTimeString(
                          [],
                          { hour: "numeric", minute: "2-digit" },
                        )
                      : ""}
                  </time>
                  {conversation.unreadCount > 0 ? (
                    <b>{conversation.unreadCount}</b>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </section>
        <ChatPane
          conversation={selected}
          presence={presence}
          isTyping={selected === null ? false : typing[selected.id] === true}
        />
      </div>
    </section>
  );
}

function ChatPane({
  conversation,
  presence,
  isTyping,
}: {
  conversation: ConversationDto | null;
  presence: Record<string, PresenceEvent>;
  isTyping: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const messages = useQuery({
    queryKey: ["messages", conversation?.id],
    queryFn: () => api.getMessages(conversation!.id),
    enabled: conversation !== null,
  });
  const participant = conversation?.participant;
  const online =
    participant === undefined
      ? false
      : (presence[participant.user.id]?.isOnline ?? false);

  useEffect(() => {
    const last = messages.data?.messages.at(-1);
    if (
      conversation !== null &&
      last !== undefined &&
      last.senderId !== participant?.user.id
    )
      void api
        .markConversationRead(conversation.id, last.id)
        .catch(() => undefined);
  }, [conversation, messages.data?.messages, participant?.user.id]);

  function send(): void {
    if (conversation === null || draft.trim() === "") return;
    const text = draft.trim();
    setDraft("");
    setSendError(null);
    realtime.sendMessage(
      {
        conversationId: conversation.id,
        clientMessageId: crypto.randomUUID(),
        type: "text",
        text,
      },
      (result) => {
        if (!result.success) {
          setSendError(result.error.message);
          return;
        }
        queryClient.setQueryData<{
          messages: MessageDto[];
          nextCursor: string | null;
        }>(["messages", conversation.id], (current) =>
          current === undefined ||
          current.messages.some(
            (message) => message.id === result.data.message.id,
          )
            ? current
            : {
                ...current,
                messages: [...current.messages, result.data.message],
              },
        );
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      },
    );
  }

  if (conversation === null || participant === undefined)
    return (
      <section className="chat-panel empty-chat">
        <div className="empty-illustration">✦</div>
        <h3>Your conversations, in sync</h3>
        <p>Select a chat or start one from Contacts.</p>
      </section>
    );
  return (
    <section className="chat-panel">
      <header className="chat-header">
        <Avatar
          name={participant.customName ?? participant.user.displayName}
          online={online}
        />
        <div>
          <strong>
            {participant.customName ?? participant.user.displayName}
          </strong>
          <span>{online ? "Online now" : "Offline"}</span>
        </div>
        <div className="chat-actions">
          <button
            className="icon-button"
            disabled
            title="Calls are being prepared"
          >
            ◉
          </button>
          <button
            className="icon-button"
            disabled
            title="Calls are being prepared"
          >
            ⋯
          </button>
        </div>
      </header>
      <div className="message-stream">
        {messages.isLoading ? (
          <div className="skeleton-messages">
            <span />
            <span />
            <span />
          </div>
        ) : messages.data?.messages.length === 0 ? (
          <div className="empty-state">
            <strong>No messages yet</strong>
            <span>Say hello to {participant.user.displayName}.</span>
          </div>
        ) : (
          messages.data?.messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              own={message.senderId !== participant.user.id}
            />
          ))
        )}
        {isTyping ? (
          <div className="typing-line">
            <span className="typing-dots">•••</span>{" "}
            {participant.user.displayName} is typing
          </div>
        ) : null}
      </div>
      <div className="composer">
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (event.target.value.trim())
              realtime.startTyping(conversation.id);
            else realtime.stopTyping(conversation.id);
          }}
          onBlur={() => realtime.stopTyping(conversation.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Write a message…"
          aria-label="Message"
        />
        <button
          className="send-button"
          onClick={send}
          disabled={!draft.trim()}
          aria-label="Send message"
        >
          ↑
        </button>
        {sendError ? <span className="send-error">{sendError}</span> : null}
      </div>
    </section>
  );
}

function MessageRow({ message, own }: { message: MessageDto; own: boolean }) {
  return (
    <div className={own ? "message-row own" : "message-row"}>
      <div className="message-bubble">
        <p>{message.text}</p>
        <span>
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          {own ? `· ${message.status}` : ""}
        </span>
      </div>
    </div>
  );
}

function ContactsWorkspace({
  contacts,
  isLoading,
  onOpen,
}: {
  contacts: ContactDto[];
  isLoading: boolean;
  onOpen: (contact: ContactDto) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const filtered = contacts.filter((contact) =>
    `${contact.customName ?? ""} ${contact.contactUser.displayName} ${contact.contactUser.username}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="workspace-pane">
      <div className="content-header">
        <div>
          <p className="eyebrow">PEOPLE</p>
          <h2>Contacts</h2>
        </div>
        <button className="round-button" aria-label="Add contact">
          +
        </button>
      </div>
      <div className="single-column">
        <div className="search-box">
          ⌕{" "}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contacts"
            aria-label="Search contacts"
          />
        </div>
        {isLoading ? (
          <div className="skeleton-list">
            <span />
            <span />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <strong>No contacts found</strong>
            <span>Contacts added through the mobile app will appear here.</span>
          </div>
        ) : (
          <div className="contact-list">
            {filtered.map((contact) => (
              <div className="contact-row" key={contact.id}>
                <Avatar
                  name={contact.customName ?? contact.contactUser.displayName}
                />
                <div>
                  <strong>
                    {contact.customName ?? contact.contactUser.displayName}
                  </strong>
                  <span>@{contact.contactUser.username}</span>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => void onOpen(contact)}
                >
                  Message
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProfileWorkspace({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  return (
    <section className="workspace-pane">
      <div className="content-header">
        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h2>Profile</h2>
        </div>
      </div>
      <div className="profile-card">
        <Avatar name={user.displayName} />
        <h3>{user.displayName}</h3>
        <p className="muted">@{user.username}</p>
        <p>{user.bio ?? "Your profile is ready for every Terqivo client."}</p>
        <div className="profile-details">
          <span>
            <small>Phone</small>
            {user.phone ?? "Not set"}
          </span>
          <span>
            <small>Email</small>
            {user.email ?? "Not set"}
          </span>
          <span>
            <small>Account</small>
            {user.accountStatus}
          </span>
        </div>
        <button className="danger-button" onClick={onLogout}>
          Log out
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const [state, setState] = useState<"loading" | "anonymous" | "authenticated">(
    "loading",
  );
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void api
      .restoreSession()
      .then((restored) => {
        setUser(restored);
        setState("authenticated");
      })
      .catch(() => {
        setState("anonymous");
        navigate("/login");
      });
  }, [navigate]);

  if (state === "loading") return <LoadingScreen />;
  return (
    <Routes>
      <Route
        path="/login"
        element={
          state === "authenticated" && user !== null ? (
            <Navigate to="/app/chats" replace />
          ) : (
            <LoginPage
              onAuthenticated={(authenticatedUser) => {
                setUser(authenticatedUser);
                setState("authenticated");
              }}
            />
          )
        }
      />
      <Route
        path="/app/:view?"
        element={
          state === "authenticated" && user !== null ? (
            <Workspace
              user={user}
              onLogout={() => {
                setUser(null);
                setState("anonymous");
                navigate("/login");
              }}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="*"
        element={
          <Navigate
            to={state === "authenticated" ? "/app/chats" : "/login"}
            replace
          />
        }
      />
    </Routes>
  );
}
