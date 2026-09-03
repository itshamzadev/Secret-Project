import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ConversationDto, MessageDto } from "@terqivo/contracts";
import { ApiClientError } from "@terqivo/api-client";

import { api, hydrateRefreshToken, realtime } from "./api";
import "./styles.css";

type User = Awaited<ReturnType<typeof api.me>>;

function Login({ onLogin }: { onLogin: (user: User) => void }) {
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
        platform: "windows",
        deviceName: "Terqivo Desktop",
      });
      onLogin(result.user);
    } catch (loginError: unknown) {
      setError(
        loginError instanceof ApiClientError
          ? loginError.message
          : "Unable to sign in.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-card">
        <span className="logo">T</span>
        <p className="eyebrow">TERQIVO DESKTOP</p>
        <h1>Everything in sync.</h1>
        <p className="muted">Sign in with your existing Terqivo account.</p>
        <form onSubmit={submit}>
          <label>
            Username, email or phone
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
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
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}

function DesktopShell({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
  });
  const selected =
    conversations.data?.conversations.find((item) => item.id === selectedId) ??
    conversations.data?.conversations[0] ??
    null;
  useEffect(() => {
    realtime.connect();
    const remove = realtime.onMessage(({ message }) => {
      queryClient.setQueryData<{
        messages: MessageDto[];
        nextCursor: string | null;
      }>(["messages", message.conversationId], (current) =>
        current === undefined ||
        current.messages.some((item) => item.id === message.id)
          ? current
          : { ...current, messages: [...current.messages, message] },
      );
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
    return () => {
      remove();
      realtime.disconnect();
    };
  }, [queryClient]);
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="logo small">T</span>
          <strong>Terqivo</strong>
        </div>
        <nav>
          <span className="active">Chats</span>
          <span>Contacts</span>
          <span>Profile</span>
        </nav>
        <div className="account">
          <strong>{user.displayName}</strong>
          <small>@{user.username}</small>
          <button onClick={onLogout}>Log out</button>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">MESSAGING</p>
            <h2>Conversations</h2>
          </div>
          <span className="connected">● Connected</span>
        </header>
        <div className="chat-layout">
          <div className="conversation-list">
            {conversations.data?.conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={conversation.id === selected?.id ? "selected" : ""}
                onClick={() => setSelectedId(conversation.id)}
              >
                <b>
                  {conversation.participant.customName ??
                    conversation.participant.user.displayName}
                </b>
                <small>
                  {conversation.lastMessage?.text ?? "Start a conversation"}
                </small>
              </button>
            ))}
          </div>
          <DesktopChat conversation={selected} />
        </div>
      </section>
    </div>
  );
}

function DesktopChat({
  conversation,
}: {
  conversation: ConversationDto | null;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const conversationId = conversation?.id ?? null;
  const messages = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (conversationId === null)
        throw new Error("A conversation must be selected.");
      return api.getMessages(conversationId);
    },
    enabled: conversationId !== null,
  });
  if (conversation === null)
    return <div className="chat-empty">Select a conversation to begin.</div>;
  const activeConversationId = conversation.id;
  function send(): void {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    realtime.sendMessage(
      {
        conversationId: activeConversationId,
        clientMessageId: crypto.randomUUID(),
        type: "text",
        text,
      },
      (result) => {
        if (result.success) {
          queryClient.setQueryData<{
            messages: MessageDto[];
            nextCursor: string | null;
          }>(["messages", activeConversationId], (current) =>
            current === undefined ||
            current.messages.some((item) => item.id === result.data.message.id)
              ? current
              : {
                  ...current,
                  messages: [...current.messages, result.data.message],
                },
          );
        }
      },
    );
  }
  return (
    <div className="chat">
      <div className="chat-top">
        <div className="avatar">
          {conversation.participant.user.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <b>
            {conversation.participant.customName ??
              conversation.participant.user.displayName}
          </b>
          <small>@{conversation.participant.user.username}</small>
        </div>
      </div>
      <div className="messages">
        {messages.data?.messages.map((message) => (
          <div
            key={message.id}
            className={
              message.senderId === conversation.participant.user.id
                ? "bubble"
                : "bubble own"
            }
          >
            {message.text}
            <small>
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </small>
          </div>
        ))}
      </div>
      <div className="composer">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send();
          }}
          placeholder="Write a message…"
        />
        <button onClick={send}>↑</button>
      </div>
    </div>
  );
}

function App() {
  const [state, setState] = useState<"loading" | "anonymous" | "authenticated">(
    "loading",
  );
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    void hydrateRefreshToken()
      .then(() => api.restoreSession())
      .then((restored) => {
        setUser(restored);
        setState("authenticated");
      })
      .catch(() => setState("anonymous"));
  }, []);
  if (state === "loading")
    return <main className="loading">Restoring encrypted session…</main>;
  return user === null ? (
    <Login
      onLogin={(loggedInUser) => {
        setUser(loggedInUser);
        setState("authenticated");
      }}
    />
  ) : (
    <DesktopShell
      user={user}
      onLogout={() => {
        void api.logout().catch(() => undefined);
        setUser(null);
        setState("anonymous");
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <App />
  </QueryClientProvider>,
);
