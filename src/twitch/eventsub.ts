import { decodeEventSub, validReconnectUrl } from './protocol.ts';
import type { ChatMessage } from './types.ts';

export interface SocketPort {
  onMessage(callback: (data: string) => void): void;
  onClose(callback: () => void): void;
  onError(callback: () => void): void;
  close(): void;
}
export type SocketFactory = (url: string) => SocketPort;
export const nativeSocket: SocketFactory = (url) => {
  const socket = new WebSocket(url);
  return {
    onMessage: (callback) =>
      socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') callback(event.data);
      }),
    onClose: (callback) => socket.addEventListener('close', callback),
    onError: (callback) => socket.addEventListener('error', callback),
    close: () => socket.close(),
  };
};

export class AuthorizationRequired extends Error {
  constructor() {
    super('Twitch authorization required');
  }
}

export interface TransportHealth {
  phase: 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'revoked';
  healthy: boolean;
}
interface Link {
  socket: SocketPort;
  abort: AbortController;
  welcomed: boolean;
  ready: boolean;
  keepaliveMs: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  welcomeTimer: ReturnType<typeof setTimeout> | undefined;
}
interface Options {
  broadcasterId: string;
  subscribe: (sessionId: string, signal: AbortSignal) => Promise<void>;
  onChat: (event: ChatMessage) => void;
  onHealth: (state: TransportHealth) => void;
  socket?: SocketFactory;
}

export class EventSubClient {
  #options: Options;
  #active: Link | undefined;
  #handoff: Link | undefined;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #attempt = 0;
  #stopped = true;
  #seen = new Map<string, number>();

  constructor(options: Options) {
    this.#options = options;
  }
  start(): boolean {
    if (!this.#stopped) return false;
    this.#attempt = 0;
    this.#stopped = false;
    this.#options.onHealth({ phase: 'connecting', healthy: false });
    this.#connect('wss://eventsub.wss.twitch.tv/ws', false);
    return true;
  }
  stop(phase: 'offline' | 'revoked' = 'offline') {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#clear();
    this.#options.onHealth({ phase, healthy: false });
  }

  #current(link: Link) {
    return !this.#stopped && (link === this.#active || link === this.#handoff);
  }
  #connect(url: string, handoff: boolean) {
    let socket: SocketPort;
    try {
      socket = (this.#options.socket ?? nativeSocket)(url);
    } catch {
      this.#lost();
      return;
    }
    const link: Link = {
      socket,
      abort: new AbortController(),
      welcomed: false,
      ready: false,
      keepaliveMs: 10000,
      timer: undefined,
      welcomeTimer: undefined,
    };
    if (handoff) this.#handoff = link;
    else this.#active = link;
    link.welcomeTimer = setTimeout(() => {
      if (this.#current(link)) this.#lost();
    }, 10000);
    socket.onMessage((raw) => {
      if (this.#current(link)) this.#message(link, raw);
    });
    const lost = () => {
      if (this.#current(link)) this.#lost();
    };
    socket.onClose(lost);
    socket.onError(lost);
  }

  #message(link: Link, raw: string) {
    const packet = decodeEventSub(raw, this.#options.broadcasterId, Date.now());
    if (!packet) return;
    if (packet.type === 'welcome') {
      if (link.welcomed) return;
      link.welcomed = true;
      link.keepaliveMs = packet.keepaliveSeconds * 1000;
      clearTimeout(link.welcomeTimer);
      link.welcomeTimer = undefined;
      this.#keepalive(link);
      if (link === this.#handoff) {
        const previous = this.#active;
        this.#active = link;
        this.#handoff = undefined;
        link.ready = true;
        this.#attempt = 0;
        if (previous) this.#close(previous);
        this.#options.onHealth({ phase: 'connected', healthy: true });
      } else {
        void Promise.resolve()
          .then(() =>
            this.#options.subscribe(packet.sessionId, link.abort.signal),
          )
          .then(() => {
            if (!this.#current(link)) return;
            link.ready = true;
            this.#attempt = 0;
            this.#options.onHealth({ phase: 'connected', healthy: true });
          })
          .catch((error: unknown) => {
            if (!this.#current(link)) return;
            if (error instanceof AuthorizationRequired) this.stop('revoked');
            else this.#lost();
          });
      }
      return;
    }
    if (!link.welcomed) return;
    if (packet.type === 'keepalive') {
      this.#keepalive(link);
      return;
    }
    if (packet.type === 'revocation') {
      this.stop('revoked');
      return;
    }
    if (packet.type === 'reconnect') {
      if (link !== this.#active || !link.ready || this.#handoff) return;
      if (!validReconnectUrl(packet.url)) {
        this.#lost();
        return;
      }
      this.#options.onHealth({ phase: 'reconnecting', healthy: true });
      this.#connect(packet.url, true);
      return;
    }
    this.#keepalive(link);
    if (link !== this.#active || !link.ready) return;
    const now = Date.now();
    for (const [key, expiresAt] of this.#seen)
      if (expiresAt <= now) this.#seen.delete(key);
    const keys = [
      `event:${packet.event.eventId}`,
      `chat:${packet.event.messageId}`,
    ];
    if (keys.some((key) => this.#seen.has(key))) return;
    for (const key of keys) this.#seen.set(key, now + 600000);
    while (this.#seen.size > 20000)
      this.#seen.delete(this.#seen.keys().next().value!);
    try {
      this.#options.onChat(packet.event);
    } catch {
      this.#lost();
    }
  }

  #keepalive(link: Link) {
    clearTimeout(link.timer);
    link.timer = setTimeout(() => {
      if (this.#current(link)) this.#lost();
    }, link.keepaliveMs);
  }
  #close(link: Link) {
    clearTimeout(link.timer);
    clearTimeout(link.welcomeTimer);
    link.abort.abort();
    try {
      link.socket.close();
    } catch {
      /* Closing never exposes server error text. */
    }
  }
  #clear() {
    clearTimeout(this.#retry);
    this.#retry = undefined;
    const links = [this.#active, this.#handoff];
    this.#active = undefined;
    this.#handoff = undefined;
    for (const link of links) if (link) this.#close(link);
  }
  #lost() {
    if (this.#stopped) return;
    this.#clear();
    this.#options.onHealth({ phase: 'reconnecting', healthy: false });
    const wait = Math.min(30000, 1000 * 2 ** Math.min(this.#attempt++, 5));
    this.#retry = setTimeout(() => {
      this.#retry = undefined;
      if (!this.#stopped)
        this.#connect('wss://eventsub.wss.twitch.tv/ws', false);
    }, wait);
  }
}
