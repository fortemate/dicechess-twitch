export interface ChatMessage {
  broadcasterId: string;
  userId: string;
  messageId: string;
  eventId: string;
  sentAt: string;
  receivedAtMs: number;
  text: string;
}

export type TwitchPhase =
  | 'not-configured'
  | 'offline'
  | 'authorizing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'revoked'
  | 'error';
export interface TwitchPublicState {
  phase: TwitchPhase;
  healthy: boolean;
  channel: string | null;
  receivedMessages: number;
}

export interface Activation {
  userCode: string;
  verificationUri: string;
  expiresAtMs: number;
}
export interface TwitchOperatorState {
  canConnect: boolean;
  canDisconnect: boolean;
  activation: Activation | null;
}
