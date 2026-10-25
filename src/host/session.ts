import { randomUUID } from 'node:crypto';
import type { OperatorCommand, PublicSnapshot } from '../shared/protocol.ts';
import type { OperatorGameState } from '../shared/game.ts';
import { Game } from './game.ts';
import type { GameOptions } from './game.ts';
import { TwitchConnection } from '../twitch/connection.ts';
import type { SocketFactory } from '../twitch/eventsub.ts';
import type { ChatMessage } from '../twitch/types.ts';
import { Preview } from '../presentation/preview.ts';
import { VotingCoordinator } from '../voting/coordinator.ts';
import type { VoteDecision } from '../shared/voting.ts';

interface SessionOptions extends Omit<GameOptions, 'changed' | 'sessionId'> {
  twitchClientId?: string;
  twitchFetch?: typeof fetch;
  twitchSocket?: SocketFactory;
  voteDurationMs?: number;
  previewStepMs?: number;
}

export class Session {
  #state = {
    sessionId: randomUUID(),
    revision: 0,
    updatedAt: new Date().toISOString(),
    message: 'One board. A whole chat.',
  };
  #onChange: (() => void) | undefined;
  readonly game: Game;
  readonly twitch: TwitchConnection;
  readonly voting: VotingCoordinator;
  readonly preview: Preview;
  #decisions: VoteDecision[] = [];
  #chatListeners = new Set<(message: ChatMessage) => void>();
  constructor(options: SessionOptions = {}) {
    const {
      twitchClientId,
      twitchFetch,
      twitchSocket,
      voteDurationMs,
      previewStepMs,
      ...gameOptions
    } = options;
    this.game = new Game({
      ...gameOptions,
      externalPreview: true,
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
        this.voting.accept(message);
        for (const listener of this.#chatListeners) listener(message);
      },
    });
    this.preview = new Preview({
      game: this.game,
      changed: () => this.#changed(),
      ...(previewStepMs !== undefined ? { stepMs: previewStepMs } : {}),
    });
    this.voting = new VotingCoordinator({
      game: this.game,
      healthy: () => this.twitch.snapshot().healthy,
      changed: () => this.#changed(),
      ...(voteDurationMs !== undefined ? { durationMs: voteDurationMs } : {}),
      previewReady: (roundId) => this.preview.ready(roundId),
      decision: (decision) => {
        this.#decisions.push(decision);
        if (this.#decisions.length > 1000) this.#decisions.shift();
      },
    });
  }

  onChange(listener: () => void) {
    this.#onChange = listener;
  }
  #changed() {
    this.preview?.observe();
    const game = this.game.snapshot();
    if (
      game.phase === 'preview' &&
      game.roundId &&
      game.choices.length === 1 &&
      this.preview?.ready(game.roundId)
    ) {
      this.game.resolveChoice(game.roundId, game.choices[0]!.option);
    }
    this.voting?.observe();
    this.#state.revision++;
    this.#state.updatedAt = new Date().toISOString();
    this.#onChange?.();
  }
  dispose() {
    this.preview.dispose();
    this.voting.dispose();
    this.game.dispose();
    this.twitch.dispose();
    this.#chatListeners.clear();
  }
  onChat(listener: (message: ChatMessage) => void) {
    this.#chatListeners.add(listener);
    return () => this.#chatListeners.delete(listener);
  }
  /** Host-only audit input for durable storage; never includes individual voters. */
  voteDecisions(): readonly VoteDecision[] {
    return [...this.#decisions];
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
      canExtendVote: this.voting.canExtend(),
      canSetVoteDuration: this.voting.canConfigure(),
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
      voting: this.voting.snapshot(),
      preview: this.preview.snapshot(),
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
      case 'extend-vote':
        accepted = this.voting.extend();
        break;
      case 'set-vote-duration':
        accepted = this.voting.setDuration(command.seconds);
        break;
    }
    if (!accepted) return undefined;
    return this.snapshot();
  }
}
