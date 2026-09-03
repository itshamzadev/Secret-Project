import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

import type {
  ApiFailure,
  ApiSuccess,
  AuthenticationResponse,
  ContactDto,
  ConversationDto,
  MessageDto,
  UserPresenceResponse,
} from "@terqivo/contracts";

export interface AuthTokenStore {
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  getRefreshToken?(): string | null;
  setRefreshToken?(token: string): void;
  clear(): void;
}

export interface ApiClientOptions {
  baseURL: string;
  tokenStore: AuthTokenStore;
  onUnauthorized?: () => void;
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  authRetry?: boolean;
}

type SuccessPayload<T> = ApiSuccess<T>;

export class ApiClientError extends Error {
  public readonly status: number | undefined;
  public readonly code: string;

  public constructor(error: AxiosError<ApiFailure>) {
    super(error.response?.data?.error?.message ?? "Request failed.");
    this.name = "ApiClientError";
    this.status = error.response?.status;
    this.code = error.response?.data?.error?.code ?? "REQUEST_FAILED";
  }
}

function isApiError(error: unknown): error is AxiosError<ApiFailure> {
  return error instanceof AxiosError;
}

function dataFrom<T>(response: { data: SuccessPayload<T> }): T {
  return response.data.data;
}

export class TerqivoApiClient {
  private readonly http: AxiosInstance;
  private readonly rawHttp: AxiosInstance;
  private readonly tokenStore: AuthTokenStore;
  private readonly onUnauthorized: (() => void) | undefined;
  private refreshPromise: Promise<string | null> | null = null;

  public constructor(options: ApiClientOptions) {
    this.tokenStore = options.tokenStore;
    this.onUnauthorized = options.onUnauthorized;
    this.http = axios.create({
      baseURL: options.baseURL,
      withCredentials: true,
      timeout: 15_000,
    });
    this.rawHttp = axios.create({
      baseURL: options.baseURL,
      withCredentials: true,
      timeout: 15_000,
    });

    this.http.interceptors.request.use((config) => {
      const accessToken = this.tokenStore.getAccessToken();
      if (accessToken !== null) {
        config.headers.set("Authorization", `Bearer ${accessToken}`);
      }
      return config;
    });

    this.http.interceptors.response.use(
      (response) => response,
      async (error: unknown) => {
        if (!isApiError(error) || error.response?.status !== 401) {
          throw isApiError(error) ? new ApiClientError(error) : error;
        }
        const config = error.config as RetriableRequestConfig | undefined;
        if (
          config === undefined ||
          config.authRetry === true ||
          config.url?.endsWith("/auth/refresh") === true
        ) {
          this.onUnauthorized?.();
          throw new ApiClientError(error);
        }

        const accessToken = await this.refreshAccessToken();
        if (accessToken === null) {
          this.onUnauthorized?.();
          throw new ApiClientError(error);
        }
        config.authRetry = true;
        config.headers.set("Authorization", `Bearer ${accessToken}`);
        return this.http.request(config);
      },
    );
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise !== null) return this.refreshPromise;
    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<string | null> {
    try {
      const refreshToken = this.tokenStore.getRefreshToken?.() ?? null;
      const response = await this.rawHttp.post<
        SuccessPayload<AuthenticationResponse>
      >("/auth/refresh", refreshToken === null ? {} : { refreshToken });
      const result = dataFrom(response);
      this.tokenStore.setAccessToken(result.accessToken);
      this.tokenStore.setRefreshToken?.(result.refreshToken);
      return result.accessToken;
    } catch {
      this.tokenStore.clear();
      return null;
    }
  }

  public async login(input: {
    identifier: string;
    password: string;
    platform: "web" | "windows";
    deviceName?: string;
  }): Promise<AuthenticationResponse> {
    const response = await this.rawHttp.post<
      SuccessPayload<AuthenticationResponse>
    >("/auth/login", input);
    const result = dataFrom(response);
    this.tokenStore.setAccessToken(result.accessToken);
    this.tokenStore.setRefreshToken?.(result.refreshToken);
    return result;
  }

  public async register(input: {
    username: string;
    name: string;
    phone: string;
    email?: string;
    password: string;
    platform: "web" | "windows";
    deviceName?: string;
  }): Promise<AuthenticationResponse> {
    const response = await this.rawHttp.post<
      SuccessPayload<AuthenticationResponse>
    >("/auth/register", input);
    const result = dataFrom(response);
    this.tokenStore.setAccessToken(result.accessToken);
    this.tokenStore.setRefreshToken?.(result.refreshToken);
    return result;
  }

  public async me(): Promise<AuthenticationResponse["user"]> {
    const response =
      await this.http.get<
        SuccessPayload<{ user: AuthenticationResponse["user"] }>
      >("/auth/me");
    return dataFrom(response).user;
  }

  public async restoreSession(): Promise<AuthenticationResponse["user"]> {
    return this.me();
  }

  public async logout(): Promise<void> {
    try {
      await this.http.post("/auth/logout");
    } finally {
      this.tokenStore.clear();
    }
  }

  public async listContacts(search?: string): Promise<{
    contacts: ContactDto[];
    nextCursor: string | null;
  }> {
    const response = await this.http.get<
      SuccessPayload<{ contacts: ContactDto[]; nextCursor: string | null }>
    >("/contacts", { params: search === undefined ? {} : { search } });
    return dataFrom(response);
  }

  public async listConversations(): Promise<{
    conversations: ConversationDto[];
    nextCursor: string | null;
  }> {
    const response = await this.http.get<
      SuccessPayload<{
        conversations: ConversationDto[];
        nextCursor: string | null;
      }>
    >("/conversations");
    return dataFrom(response);
  }

  public async createDirectConversation(
    userId: string,
  ): Promise<ConversationDto> {
    const response = await this.http.post<
      SuccessPayload<{ conversation: ConversationDto }>
    >("/conversations/direct", { userId });
    return dataFrom(response).conversation;
  }

  public async getMessages(conversationId: string): Promise<{
    messages: MessageDto[];
    nextCursor: string | null;
  }> {
    const response = await this.http.get<
      SuccessPayload<{ messages: MessageDto[]; nextCursor: string | null }>
    >(`/conversations/${conversationId}/messages`);
    return dataFrom(response);
  }

  public async sendMessage(
    conversationId: string,
    input: { clientMessageId: string; type: "text"; text: string },
  ): Promise<{ message: MessageDto; duplicate: boolean }> {
    const response = await this.http.post<
      SuccessPayload<{ message: MessageDto; duplicate: boolean }>
    >(`/conversations/${conversationId}/messages`, input);
    return dataFrom(response);
  }

  public async markConversationRead(
    conversationId: string,
    lastReadMessageId: string,
  ): Promise<void> {
    await this.http.post(`/conversations/${conversationId}/read`, {
      lastReadMessageId,
    });
  }

  public async getPresence(userId: string): Promise<UserPresenceResponse> {
    const response = await this.http.get<SuccessPayload<UserPresenceResponse>>(
      `/users/${userId}/presence`,
    );
    return dataFrom(response);
  }
}

export function createMemoryTokenStore(): AuthTokenStore {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  return {
    getAccessToken: () => accessToken,
    setAccessToken: (token) => {
      accessToken = token;
    },
    getRefreshToken: () => refreshToken,
    setRefreshToken: (token) => {
      refreshToken = token;
    },
    clear: () => {
      accessToken = null;
      refreshToken = null;
    },
  };
}
