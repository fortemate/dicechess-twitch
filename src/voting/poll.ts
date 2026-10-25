import { randomInt } from 'node:crypto';
import { isTimestamp, numericId, text } from '../twitch/protocol.ts';
import type { ChatMessage } from '../twitch/types.ts';
import type { VoteDecision } from '../shared/voting.ts';

/** Preserve all nine RFC3339 fractional digits; Date.parse alone loses six. */
export function timestampNs(value: string): bigint | undefined {
  if (!isTimestamp(value)) return undefined;
  const fraction = /\.(\d{1,9})/.exec(value)?.[1] ?? '';
  const seconds = Date.parse(value.replace(/\.\d+/, ''));
  return BigInt(seconds) * 1000000n + BigInt(fraction.padEnd(9, '0'));
}

/** Recorded seed + sorted leaders completely reproduce a tie selection. */
export function selectLeader(leaders: readonly number[], seed: number) {
  if (!leaders.length) throw new Error('No vote leaders');
  let state = seed >>> 0;
  const limit = Math.floor(4294967296 / leaders.length) * leaders.length;
  for (;;) {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const draw = (value ^ (value >>> 14)) >>> 0;
    if (draw < limit) return draw % leaders.length;
  }
}

interface Vote {
  option: number;
  timestamp: bigint;
  messageId: string;
}

/** One immutable option set. All clocks are host-owned and explicitly supplied. */
export class Poll {
  readonly roundId: string;
  readonly options: readonly number[];
  phase: 'open' | 'paused' | 'waiting' | 'resolved' = 'open';
  openedAtMs: number;
  closesAtMs: number;
  #remainingMs = 0;
  #votes = new Map<string, Vote>();
  #counts = new Map<number, number>();
  #seen = new Set<string>();
  #decision: VoteDecision | undefined;
  constructor(
    roundId: string,
    options: readonly number[],
    now: number,
    durationMs: number,
  ) {
    if (
      !roundId ||
      options.length < 2 ||
      options.length > 3 ||
      new Set(options).size !== options.length ||
      options.some((option) => ![1, 2, 3].includes(option)) ||
      !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(durationMs) ||
      durationMs <= 0
    )
      throw new Error('Invalid poll');
    this.roundId = roundId;
    this.options = Object.freeze([...options]);
    for (const option of options) this.#counts.set(option, 0);
    this.openedAtMs = now;
    this.closesAtMs = now + durationMs;
  }
  counts() {
    return this.options.map((option) => ({
      option,
      votes: this.#counts.get(option)!,
    }));
  }
  remaining(now: number) {
    return this.phase === 'paused'
      ? this.#remainingMs
      : this.phase === 'open'
        ? Math.max(0, this.closesAtMs - now)
        : 0;
  }
  accept(event: ChatMessage, now: number): boolean {
    if (
      this.phase !== 'open' ||
      now < this.openedAtMs ||
      now >= this.closesAtMs ||
      !numericId(event.userId) ||
      !text(event.messageId) ||
      !text(event.eventId) ||
      !Number.isFinite(event.receivedAtMs) ||
      event.receivedAtMs < this.openedAtMs ||
      event.receivedAtMs >= this.closesAtMs ||
      event.receivedAtMs > now
    )
      return false;
    const command = /^!vote ([1-3])$/i.exec(event.text.trim());
    if (!command) return false;
    const option = Number(command[1]);
    if (!this.options.includes(option)) return false;
    const timestamp = timestampNs(event.sentAt);
    if (
      timestamp === undefined ||
      timestamp < BigInt(this.openedAtMs) * 1000000n ||
      timestamp >= BigInt(this.closesAtMs) * 1000000n ||
      timestamp >= BigInt(now + 1) * 1000000n
    )
      return false;
    const keys = [`event:${event.eventId}`, `message:${event.messageId}`];
    if (keys.some((key) => this.#seen.has(key)) || this.#seen.size >= 200000)
      return false;
    for (const key of keys) this.#seen.add(key);
    const previous = this.#votes.get(event.userId);
    if (
      previous &&
      (timestamp < previous.timestamp ||
        (timestamp === previous.timestamp &&
          event.messageId <= previous.messageId))
    )
      return false;
    this.#votes.set(event.userId, {
      option,
      timestamp,
      messageId: event.messageId,
    });
    if (previous)
      this.#counts.set(previous.option, this.#counts.get(previous.option)! - 1);
    this.#counts.set(option, this.#counts.get(option)! + 1);
    return true;
  }
  pause(now: number) {
    if (this.phase !== 'open') return false;
    this.#remainingMs = this.remaining(now);
    this.phase = 'paused';
    return true;
  }
  resume(now: number) {
    if (this.phase !== 'paused') return false;
    this.openedAtMs = now;
    this.closesAtMs = now + this.#remainingMs;
    this.phase = 'open';
    return true;
  }
  extend(now: number, durationMs: number) {
    if (this.phase !== 'waiting' || durationMs <= 0) return false;
    this.openedAtMs = now;
    this.closesAtMs = now + durationMs;
    this.phase = 'open';
    return true;
  }
  close(
    now: number,
    seed = randomInt(0, 4294967296),
  ): VoteDecision | undefined {
    if (this.phase !== 'open' || now < this.closesAtMs) return undefined;
    const counts = this.counts();
    const highest = Math.max(...counts.map((count) => count.votes));
    if (highest === 0) {
      this.phase = 'waiting';
      return undefined;
    }
    const leaders = counts
      .filter((count) => count.votes === highest)
      .map((count) => count.option)
      .sort((a, b) => a - b);
    const selectedIndex = selectLeader(leaders, seed);
    this.#decision = Object.freeze({
      roundId: this.roundId,
      closedAtMs: this.closesAtMs,
      counts: Object.freeze(counts.map((count) => Object.freeze(count))),
      leaders: Object.freeze(leaders),
      seed,
      selectedIndex,
      winner: leaders[selectedIndex]!,
    });
    this.phase = 'resolved';
    return this.#decision;
  }
}
