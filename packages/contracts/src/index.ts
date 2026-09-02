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

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  type: "text";
  text: string;
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
}

export interface IncomingCallNotificationData {
  type: "incoming_call";
  callId: string;
  callerId: string;
  callType: CallType;
}

export type PushNotificationData =
  MessageNotificationData | IncomingCallNotificationData;

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
