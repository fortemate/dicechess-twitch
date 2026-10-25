import { randomUUID } from 'node:crypto';
import type { OperatorCommand, PublicSnapshot } from '../shared/protocol.ts';
import type { OperatorGameState } from '../shared/game.ts';
import { Game } from './game.ts';
import type { GameOptions } from './game.ts';

export class Session {
  #state = {
    sessionId: randomUUID(),
    revision: 0,
    updatedAt: new Date().toISOString(),
    message: 'Preparing the table',
  };
  #onChange: (() => void) | undefined;
  readonly game: Game;
  constructor(options: Omit<GameOptions, 'changed' | 'sessionId'> = {}) {
    this.game = new Game({
      ...options,
      sessionId: this.#state.sessionId,
      changed: () => this.#changed(),
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
      integration: 'not-connected',
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
    }
    if (!accepted) return undefined;
    return this.snapshot();
  }
}
