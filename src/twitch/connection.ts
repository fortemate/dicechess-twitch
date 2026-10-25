import { TwitchAuth } from './auth.ts';
import { EventSubClient } from './eventsub.ts';
import type { SocketFactory, TransportHealth } from './eventsub.ts';
import type {
  ChatMessage,
  TwitchPublicState,
  TwitchOperatorState,
} from './types.ts';

interface Options {
  clientId?: string;
  changed: () => void;
  interrupted: () => void;
  restored: () => void;
  onChat: (event: ChatMessage) => void;
  fetcher?: typeof fetch;
  socket?: SocketFactory;
}

export class TwitchConnection {
  #options: Options;
  #auth: TwitchAuth;
  #transport: EventSubClient | undefined;
  #health: TransportHealth = { phase: 'offline', healthy: false };
  #received = 0;
  #previousHealthy = false;
  #disposed = false;
  constructor(options: Options) {
    this.#options = options;
    this.#auth = new TwitchAuth({
      ...(options.clientId ? { clientId: options.clientId } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      changed: () => this.#authChanged(),
      authorized: (identity) => {
        this.#transport = new EventSubClient({
          broadcasterId: identity.userId,
          subscribe: (sessionId, signal) =>
            this.#auth.subscribeChat(sessionId, signal),
          ...(options.socket ? { socket: options.socket } : {}),
          onChat: (event) => {
            this.#received++;
            this.#options.onChat(event);
            this.#publish();
          },
          onHealth: (health) => {
            this.#health = health;
            if (health.phase === 'revoked') this.#auth.invalidate();
            this.#publish();
          },
        });
        this.#transport.start();
      },
    });
  }
  snapshot(): TwitchPublicState {
    const auth = this.#auth.state();
    return {
      phase:
        auth.phase === 'authorized'
          ? this.#health.phase === 'offline'
            ? 'connecting'
            : this.#health.phase
          : auth.phase,
      healthy: auth.phase === 'authorized' && this.#health.healthy,
      channel: auth.identity?.login ?? null,
      receivedMessages: this.#received,
    };
  }
  operatorState(): TwitchOperatorState {
    return this.#auth.operatorState();
  }
  connect() {
    if (this.#disposed || !this.#auth.operatorState().canConnect) return false;
    this.#received = 0;
    return this.#auth.connect();
  }
  disconnect(): boolean {
    if (this.#disposed || !this.#auth.operatorState().canDisconnect)
      return false;
    this.#auth.disconnect();
    return true;
  }
  dispose() {
    this.#disposed = true;
    this.#transport?.stop();
    this.#transport = undefined;
    this.#auth.disconnect();
  }
  #authChanged() {
    if (this.#auth.state().phase !== 'authorized') {
      this.#transport?.stop();
      this.#transport = undefined;
      this.#health = { phase: 'offline', healthy: false };
    }
    this.#publish();
  }
  #publish() {
    if (this.#disposed) return;
    const healthy = this.snapshot().healthy;
    const previous = this.#previousHealthy;
    this.#previousHealthy = healthy;
    if (previous && !healthy) this.#options.interrupted();
    if (!previous && healthy) this.#options.restored();
    this.#options.changed();
  }
}
