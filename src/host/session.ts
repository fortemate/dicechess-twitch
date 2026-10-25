import { randomUUID } from 'node:crypto';
import type { OperatorCommand, PublicSnapshot } from '../shared/protocol.ts';
import type { OperatorGameState } from '../shared/game.ts';
import { Game } from './game.ts';
import type { GameOptions } from './game.ts';
import { TwitchConnection } from '../twitch/connection.ts';
import type { SocketFactory } from '../twitch/eventsub.ts';
import type { ChatMessage } from '../twitch/types.ts';

interface SessionOptions extends Omit<GameOptions, 'changed' | 'sessionId'> {
  twitchClientId?: string;
  twitchFetch?: typeof fetch;
  twitchSocket?: SocketFactory;
}

export class Session {
  #state = {
    sessionId: randomUUID(),
    revision: 0,
    updatedAt: new Date().toISOString(),
    message: 'Preparing the table',
  };
  #onChange: (() => void) | undefined;
  readonly game: Game;
  readonly twitch: TwitchConnection;
  #chatListeners = new Set<(message: ChatMessage) => void>();
  constructor(options: SessionOptions = {}) {
    const { twitchClientId, twitchFetch, twitchSocket, ...gameOptions } =
      options;
    this.game = new Game({
      ...gameOptions,
      sessionId: this.#state.sessionId,
      changed: () => this.#changed(),
    });
    this.twitch = new TwitchConnection({
      ...(twitchClientId ? { clientId: twitchClientId } : {}),
      ...(twitchFetch ? { fetcher: twitchFetch } : {}),
      ...(twitchSocket ? { socket: twitchSocket } : {}),
      changed: () => this.#changed(),
      interrupted: () => this.game.chatInterrupted(),
      restored: () => this.game.chatRestored(),
      onChat: (message) => {
        for (const listener of this.#chatListeners) listener(message);
      },
    });
  }

  onChange(listener: () => void) {
    this.#onChange = listener;
  }
  #changed() {
    this.#state.revision++;
    this.#state.updatedAt = new Date().toISOString();
    this.#onChange?.();
  }
  dispose() {
    this.game.dispose();
    this.twitch.dispose();
    this.#chatListeners.clear();
  }
  onChat(listener: (message: ChatMessage) => void) {
    this.#chatListeners.add(listener);
    return () => this.#chatListeners.delete(listener);
  }
  operatorTwitchState() {
    return {
      sessionId: this.#state.sessionId,
      revision: this.#state.revision,
      ...this.twitch.operatorState(),
    };
  }

  operatorState(): OperatorGameState {
    return {
      sessionId: this.#state.sessionId,
      revision: this.#state.revision,
      ...this.game.controls(),
    };
  }

  snapshot(): PublicSnapshot {
    // An explicit projection also prevents future internal fields from leaking.
    const state = this.#state;
    return {
      sessionId: state.sessionId,
      revision: state.revision,
      updatedAt: state.updatedAt,
      message: state.message,
      integration: this.twitch.snapshot().healthy
        ? 'connected'
        : 'not-connected',
      twitch: this.twitch.snapshot(),
      game: this.game.snapshot(),
    };
  }

  apply(command: OperatorCommand): PublicSnapshot | undefined {
    if (
      command.sessionId !== this.#state.sessionId ||
      command.expectedRevision !== this.#state.revision
    )
      return undefined;
    let accepted = false;
    switch (command.action) {
      case 'set-message':
        this.#state.message = command.message.trim();
        this.#changed();
        accepted = true;
        break;
      case 'start':
        accepted = this.game.start(command.streamerColor);
        break;
      case 'roll':
        accepted = this.game.roll();
        break;
      case 'move':
        accepted = this.game.move(command.uci);
        break;
      case 'pause':
        accepted = this.game.pause();
        break;
      case 'resume':
        accepted = this.game.resume();
        break;
      case 'rematch':
        accepted =
          this.game.controls().canRematch &&
          this.game.start(this.game.snapshot().streamerColor);
        break;
      case 'twitch-connect':
        accepted = this.twitch.connect();
        break;
      case 'twitch-disconnect':
        accepted = this.twitch.disconnect();
        break;
    }
    if (!accepted) return undefined;
    return this.snapshot();
  }
}
