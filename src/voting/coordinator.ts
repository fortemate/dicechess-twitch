import type { Game } from '../host/game.ts';
import type { ChatMessage } from '../twitch/types.ts';
import type { PublicVoting, VoteDecision } from '../shared/voting.ts';
import { Poll } from './poll.ts';

interface Options {
  game: Game;
  healthy: () => boolean;
  changed: () => void;
  previewMs?: number;
  durationMs?: number;
  decision?: (decision: VoteDecision) => void;
}

/** The host alone opens/closes polls and commits their resolved full turn. */
export class VotingCoordinator {
  #options: Options;
  #poll: Poll | undefined;
  #durationMs: number;
  #lastDecision: VoteDecision | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #previewRound: string | undefined;
  #disposed = false;
  constructor(options: Options) {
    this.#options = options;
    this.#durationMs = options.durationMs ?? 30000;
  }
  snapshot(): PublicVoting {
    const poll = this.#poll;
    const game = this.#options.game.snapshot();
    const counts = poll?.counts() ?? [];
    return {
      phase:
        poll?.phase ??
        (game.phase === 'preview' && game.choices.length > 1
          ? 'preview'
          : 'idle'),
      roundId:
        poll?.roundId ?? (game.phase === 'preview' ? game.roundId : null),
      durationMs: this.#durationMs,
      openedAtMs: poll?.openedAtMs ?? null,
      closesAtMs: poll?.phase === 'open' ? poll.closesAtMs : null,
      remainingMs: poll?.remaining(Date.now()) ?? 0,
      counts,
      totalVoters: counts.reduce((total, count) => total + count.votes, 0),
      lastDecision: this.#lastDecision,
    };
  }
  canConfigure() {
    return !['preview', 'voting', 'paused'].includes(
      this.#options.game.snapshot().phase,
    );
  }
  setDuration(seconds: number) {
    if (
      !this.canConfigure() ||
      !Number.isInteger(seconds) ||
      seconds < 5 ||
      seconds > 120
    )
      return false;
    this.#durationMs = seconds * 1000;
    this.#options.changed();
    return true;
  }
  canExtend() {
    return (
      this.#poll?.phase === 'waiting' &&
      this.#options.game.snapshot().phase === 'voting' &&
      this.#options.healthy()
    );
  }
  extend() {
    if (!this.canExtend() || !this.#poll?.extend(Date.now(), this.#durationMs))
      return false;
    this.#options.changed();
    this.#schedule();
    return true;
  }
  observe() {
    if (this.#disposed) return;
    const game = this.#options.game.snapshot();
    if (this.#poll && this.#poll.roundId !== game.roundId)
      this.#poll = undefined;
    if (
      this.#previewRound &&
      (game.phase !== 'preview' || game.roundId !== this.#previewRound)
    ) {
      this.#previewRound = undefined;
      this.#clearTimer();
    }
    if (game.phase === 'paused' || !this.#options.healthy()) {
      this.#poll?.pause(Date.now());
      this.#previewRound = undefined;
      this.#clearTimer();
      return;
    }
    if (game.phase === 'preview' && game.choices.length > 1 && game.roundId) {
      if (this.#previewRound === game.roundId) return;
      const roundId = game.roundId;
      this.#previewRound = roundId;
      this.#clearTimer();
      // This pre-vote hold is replaced by the animated host preview in Issue #7.
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        this.#previewRound = undefined;
        const current = this.#options.game.snapshot();
        if (
          this.#disposed ||
          !this.#options.healthy() ||
          current.phase !== 'preview' ||
          current.roundId !== roundId
        )
          return;
        this.#poll = new Poll(
          roundId,
          current.choices.map((choice) => choice.option),
          Date.now(),
          this.#durationMs,
        );
        if (!this.#options.game.openVoting(roundId)) {
          this.#poll = undefined;
          return;
        }
        this.#options.changed();
        this.#schedule();
      }, this.#options.previewMs ?? 4500);
      return;
    }
    if (game.phase === 'voting' && this.#poll) {
      if (this.#poll.resume(Date.now())) this.#options.changed();
      this.#schedule();
    } else this.#clearTimer();
  }
  accept(message: ChatMessage) {
    const game = this.#options.game.snapshot();
    if (
      !this.#options.healthy() ||
      game.phase !== 'voting' ||
      game.roundId !== this.#poll?.roundId
    )
      return false;
    const now = Date.now();
    this.#close(now);
    const accepted = this.#poll?.accept(message, now) ?? false;
    if (accepted) this.#options.changed();
    return accepted;
  }
  #close(now: number) {
    const poll = this.#poll;
    if (!poll || poll.phase !== 'open' || now < poll.closesAtMs) return;
    const decision = poll.close(now);
    if (decision) {
      this.#lastDecision = decision;
      this.#options.decision?.(decision);
      // Poll closes before invoking game callbacks, so duplicate timers/events cannot resolve twice.
      if (!this.#options.game.resolveChoice(decision.roundId, decision.winner))
        this.#options.game.pause();
    }
    this.#options.changed();
  }
  #schedule() {
    if (this.#timer || this.#poll?.phase !== 'open' || this.#disposed) return;
    this.#timer = setTimeout(
      () => {
        this.#timer = undefined;
        this.#close(Date.now());
        this.#options.changed();
        this.#schedule();
      },
      Math.min(1000, Math.max(1, this.#poll.closesAtMs - Date.now())),
    );
  }
  #clearTimer() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }
  dispose() {
    this.#disposed = true;
    this.#clearTimer();
  }
}
