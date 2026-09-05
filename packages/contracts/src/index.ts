export const apiVersion = "v1" as const;

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export const clientPlatforms = [
  "web",
  "android",
  "ios",
  "windows",
  "macos",
  "linux",
  "unknown",
] as const;

export type ClientPlatform = (typeof clientPlatforms)[number];

export interface SafeUserDto {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  avatarUrl: string | null;
  bio: string | null;
  role: "user" | "moderator" | "admin";
  accountStatus: "active" | "suspended" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionDto {
  id: string;
  deviceId: string | null;
  deviceName: string;
  platform: ClientPlatform;
  createdAt: string;
  lastUsedAt: string;
  lastRefreshAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AuthenticationResponse {
  user: SafeUserDto;
  session: AuthSessionDto;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export interface ContactUserDto {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export interface ContactDto {
  id: string;
  contactUser: ContactUserDto;
  customName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ConversationType = "direct";

export const messageTypes = [
  "text",
  "image",
  "video",
  "audio",
  "file",
] as const;
export type MessageType = (typeof messageTypes)[number];

export const messageReactionEmojis = [
  "❤️",
  "😂",
  "😮",
  "😢",
  "👍",
  "🙏",
] as const;
export type MessageReactionEmoji = (typeof messageReactionEmojis)[number];

export interface MediaUploadMetadata {
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fileName: string | null;
}

export interface MessageMediaDto extends MediaUploadMetadata {
  url: string;
  storageKey: string;
  thumbnailUrl: string | null;
}

export interface MessageReactionDto {
  userId: string;
  emoji: MessageReactionEmoji;
  reactedAt: string;
}

export interface MessageReactionUpdatedEvent {
  message: MessageDto;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  type: MessageType;
  text: string | null;
  media: MessageMediaDto | null;
  reactions: MessageReactionDto[];
  sequence: number;
  status: "sent" | "delivered" | "read";
  createdAt: string;
  updatedAt: string;
}

export interface ConversationParticipantDto {
  user: ContactUserDto;
  customName: string | null;
}

export interface ConversationDto {
  id: string;
  type: ConversationType;
  participant: ConversationParticipantDto;
  lastMessage: MessageDto | null;
  lastMessageAt: string | null;
  unreadCount: number;
  mutedUntil: string | null;
  muted: boolean;
  manualUnread: boolean;
  clearedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PresenceEvent {
  userId: string;
  isOnline: boolean;
  status: "online" | "offline";
  lastSeenAt: string | null;
}

export interface PresenceSessionDto {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
}

export interface UserPresenceResponse {
  isOnline: boolean;
  lastSeenAt: string | null;
  sessions: PresenceSessionDto[];
  nextCursor: string | null;
}

export interface SocketMessageSendInput {
  conversationId: string;
  clientMessageId: string;
  type: "text";
  text: string;
}

export interface WebSearchResultDto {
  position?: number;
  title?: string;
  snippet?: string;
  url: string;
  displayUrl?: string;
  source?: string;
  favicon?: string;
  thumbnail?: string;
}

export interface WebSearchSourceDto {
  title?: string;
  url: string;
}

export interface WebSearchResponseData {
  query: string;
  provider: "google";
  page: number;
  results: WebSearchResultDto[];
}

export const aiModelIds = [
  "gemini-native-audio",
  "gemini-flash",
  "terqivo-ai",
] as const;

export type AiModelId = (typeof aiModelIds)[number];

export interface AiModelOption {
  id: AiModelId;
  label: string;
  description: string;
}

export const aiModelOptions: readonly AiModelOption[] = [
  {
    id: "terqivo-ai",
    label: "Terqivo AI",
    description:
      "Terqivo's optimized AI assistant for fast, reliable responses.",
  },
  {
    id: "gemini-flash",
    label: "Gemini 2.5 Flash",
    description: "Direct Gemini text generation for general questions.",
  },
  {
    id: "gemini-native-audio",
    label: "Gemini 2.5 Flash Native Audio",
    description: "The existing native-audio model slot for voice experiences.",
  },
];

export type AiRequestState =
  "queued" | "processing" | "streaming" | "completed" | "failed" | "cancelled";

export interface AiQueryRequest {
  query: string;
  modelId?: AiModelId;
  requestId?: string;
  conversationId?: string;
}

export interface AiResponseData {
  answer: string;
  model: AiModelId;
  grounded: boolean;
  route: "local" | "gemini" | "child";
  requestId: string;
  state: Extract<AiRequestState, "completed">;
  sources?: WebSearchSourceDto[];
}

export interface AiModelOptionsData {
  models: readonly AiModelOption[];
}

export interface SocketMessageEvent {
  message: MessageDto;
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
}

export const callTypes = ["voice", "video"] as const;
export type CallType = (typeof callTypes)[number];

export const callStatuses = [
  "ringing",
  "accepted",
  "declined",
  "missed",
  "ended",
  "cancelled",
  "failed",
] as const;
export type CallStatus = (typeof callStatuses)[number];

export const callEndReasons = [
  "declined",
  "cancelled",
  "timeout",
  "remote-ended",
  "connection-failed",
  "local-ended",
  "unknown",
] as const;
export type CallEndReason = (typeof callEndReasons)[number];

export interface CallUserDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CallSignalDto {
  id: string;
  type: CallType;
  callerId: string;
  calleeId: string;
  status: CallStatus;
  initiatedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

export interface CallIncomingSocketEvent {
  call: CallSignalDto;
  caller: CallUserDto;
}

export interface CallSocketEvent {
  call: CallSignalDto;
}

export interface CallAnsweredElsewhereEvent {
  callId: string;
  type: CallType;
}

export interface WebRtcDescription {
  type: "offer" | "answer";
  sdp: string;
}

export interface WebRtcDescriptionPayload {
  callId: string;
  description: WebRtcDescription;
}

export interface WebRtcIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface WebRtcIceCandidatePayload {
  callId: string;
  candidate: WebRtcIceCandidate;
}

export interface CallDto {
  id: string;
  type: CallType;
  direction: "incoming" | "outgoing";
  otherUser: CallUserDto;
  status: CallStatus;
  initiatedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  endReason: CallEndReason | null;
}

export interface CallHistoryData {
  calls: CallDto[];
  nextCursor: string | null;
}

export const pushPlatforms = ["android"] as const;
export type PushPlatform = (typeof pushPlatforms)[number];

export interface PushDeviceDto {
  id: string;
  platform: PushPlatform;
  deviceId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageNotificationData {
  type: "message";
  conversationId: string;
  senderId: string;
  messageId?: string;
}

export interface IncomingCallNotificationData {
  type: "incoming_call";
  callId: string;
  callerId: string;
  callType: CallType;
}

export interface MissedCallNotificationData {
  type: "missed_call";
  callId: string;
  callerId: string;
  callType: CallType;
}

export type PushNotificationData =
  | MessageNotificationData
  | IncomingCallNotificationData
  | MissedCallNotificationData;

export interface NotificationDeviceRegistrationData {
  device: PushDeviceDto;
}

export interface NotificationDeviceRemovalData {
  removed: boolean;
}

export interface CallActionData {
  call: CallSignalDto;
  changed: boolean;
}

export interface WebRtcRelayData {
  relayed: true;
}

export const adminRoles = [
  "super_admin",
  "admin",
  "moderator",
  "support",
] as const;
export type AdminRole = (typeof adminRoles)[number];

export const adminPermissions = [
  "dashboard.view",
  "users.view",
  "users.manage",
  "users.suspend",
  "reports.view",
  "reports.resolve",
  "calls.view_metadata",
  "notifications.send",
  "audit.view",
] as const;
export type AdminPermission = (typeof adminPermissions)[number];

export interface AdminUserDto {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  permissions: AdminPermission[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminAuthenticationResponse {
  admin: AdminUserDto;
  accessToken: string;
  accessTokenExpiresIn: number;
}

export interface AdminDashboardDto {
  users: {
    total: number;
    active: number;
    suspended: number;
    disabled: number;
    online: number;
  };
  conversations: { total: number };
  messages: { total: number; today: number };
  calls: { total: number; missed: number };
  pushDevices: { enabled: number };
  health: {
    database: "connected" | "disconnected";
    redis: "connected" | "disconnected";
    uptime: number;
  };
}

export interface AdminUserListItemDto {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  accountStatus: SafeUserDto["accountStatus"];
  role: SafeUserDto["role"];
  createdAt: string;
  lastSeenAt: string | null;
}

export interface AdminUserListResponse {
  users: AdminUserListItemDto[];
  nextCursor: string | null;
}
