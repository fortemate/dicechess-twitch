import { DiceChess as Rules } from '@fortemate/dicechess-engine/rules';
import type { SavedGame } from './saved-game.ts';
import type { VoteDecision } from '../shared/voting.ts';
import { selectLeader } from '../voting/poll.ts';
import { compareCodeUnits } from '../shared/order.ts';

export interface SessionCheckpoint {
  version: 1;
  message: string;
  game: SavedGame;
  voteDurationMs: number;
  decisions: readonly VoteDecision[];
  requiresChat: boolean;
}
export interface CheckpointStore {
  load(): SessionCheckpoint | undefined;
  save(checkpoint: SessionCheckpoint): void;
  close(): void;
}

function ensure(condition: unknown): asserts condition {
  if (!condition) throw new Error('Saved session is invalid or unsupported');
}
function object(
  value: unknown,
  keys: string,
): asserts value is Record<string, unknown> {
  ensure(value && typeof value === 'object' && !Array.isArray(value));
  ensure(
    Object.keys(value).sort(compareCodeUnits).join(',') ===
      keys.split(',').sort(compareCodeUnits).join(','),
  );
}
function integer(
  value: unknown,
  max = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= max
  );
}
function id(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
  );
}
function dfen(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 256) return false;
  const fields = value.split(' ');
  if (fields.length !== 6 && fields.length !== 7) return false;
  const ranks = fields[0]!.split('/');
  if (
    ranks.length !== 8 ||
    ranks.some(
      (rank) =>
        !/^[prnbqkPRNBQK1-8]+$/.test(rank) ||
        rank.replace(/\d/g, (digit) => '.'.repeat(Number(digit))).length !== 8,
    )
  )
    return false;
  if (
    !['w', 'b'].includes(fields[1]!) ||
    !/^(?:-|K?Q?k?q?)$/.test(fields[2]!) ||
    !fields[2] ||
    !/^(?:-|(?:[a-h][36]){1,16})$/.test(fields[3]!)
  )
    return false;
  // Dice Chess can double-push several pawns per turn. Old rank-3 and new
  // rank-6 targets (or the reverse) can coexist until the engine ends the turn.
  const targets = fields[3]!.match(/[a-h][36]/g) ?? [];
  if (new Set(targets).size !== targets.length) return false;
  if (
    ![4, 5].every(
      (index) =>
        /^\d{1,12}$/.test(fields[index]!) && integer(Number(fields[index])),
    )
  )
    return false;
  if (
    fields.length === 7 &&
    !(fields[1] === 'w' ? /^[PNBRQK]{1,3}$/ : /^[pnbrqk]{1,3}$/).test(
      fields[6]!,
    )
  )
    return false;
  return Rules.canonicalKey(value) !== undefined;
}
function moves(value: unknown): asserts value is string[] {
  ensure(
    Array.isArray(value) &&
      value.length <= 3 &&
      value.every(
        (move) =>
          typeof move === 'string' &&
          /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move),
      ),
  );
}
function choice(value: unknown) {
  object(value, 'option,moves,resultingDfen');
  ensure(
    integer(value.option, 3) && value.option > 0 && dfen(value.resultingDfen),
  );
  moves(value.moves);
  ensure(value.moves.length);
}
function apply(root: string, sequence: readonly string[], end = false): string {
  let next = root;
  for (const uci of sequence) {
    const applied = Rules.applyMove(
      next,
      uci.slice(0, 2),
      uci.slice(2, 4),
      uci[4],
    );
    ensure(applied);
    next = applied;
  }
  const board = next.split(' ')[0]!;
  if (end && board.includes('K') && board.includes('k')) {
    const ended = Rules.endTurn(next);
    ensure(ended);
    next = ended;
  }
  return next;
}
const phases = [
  'idle',
  'streamer-roll',
  'streamer-preparing',
  'streamer-turn',
  'chat-roll',
  'chat-preparing',
  'preview',
  'voting',
  'resolving',
  'chat-animation',
  'paused',
  'game-over',
];
const base = (position: string) => position.split(' ').slice(0, 6).join(' ');

function game(value: unknown): asserts value is SavedGame {
  object(
    value,
    'gameId,startingDfen,dfen,positionVersion,phase,resumePhase,streamerColor,rolledDfen,roundId,moves,candidates,animation,resolvedRounds,winner,history,pendingPass,chatUnavailable',
  );
  ensure(value.gameId === null || id(value.gameId));
  ensure(
    dfen(value.startingDfen) &&
      value.startingDfen.split(' ').length === 6 &&
      dfen(value.dfen),
  );
  ensure(
    integer(value.positionVersion) && phases.includes(String(value.phase)),
  );
  ensure(
    value.resumePhase === null ||
      (phases.includes(String(value.resumePhase)) &&
        !['paused', 'idle', 'game-over'].includes(String(value.resumePhase))),
  );
  ensure((value.phase === 'paused') === (value.resumePhase !== null));
  ensure(
    ['w', 'b'].includes(String(value.streamerColor)) &&
      [null, 'w', 'b'].includes(value.winner as null),
  );
  ensure(
    value.rolledDfen === null ||
      (dfen(value.rolledDfen) && value.rolledDfen.split(' ').length === 7),
  );
  ensure(value.roundId === null || id(value.roundId));
  ensure(
    typeof value.pendingPass === 'boolean' &&
      typeof value.chatUnavailable === 'boolean',
  );
  moves(value.moves);
  ensure(
    Array.isArray(value.resolvedRounds) &&
      value.resolvedRounds.length <= 10000 &&
      value.resolvedRounds.every(id) &&
      new Set(value.resolvedRounds).size === value.resolvedRounds.length,
  );
  ensure(Array.isArray(value.history) && value.history.length <= 10000);
  let prior = value.startingDfen;
  for (const record of value.history) {
    object(record, 'side,rolledDfen,moves,resultingDfen,reason,roundId,option');
    ensure(
      dfen(record.rolledDfen) &&
        dfen(record.resultingDfen) &&
        record.rolledDfen.split(' ').length === 7,
    );
    ensure(
      base(record.rolledDfen) === prior &&
        record.side === record.rolledDfen.split(' ')[1],
    );
    moves(record.moves);
    ensure(
      ['streamer', 'chat-choice', 'single-choice', 'forced-pass'].includes(
        String(record.reason),
      ),
    );
    ensure(record.roundId === null || id(record.roundId));
    ensure(
      record.option === null ||
        (integer(record.option, 3) && record.option > 0),
    );
    ensure((record.reason === 'forced-pass') === (record.moves.length === 0));
    ensure(
      (record.reason === 'chat-choice' || record.reason === 'single-choice') ===
        (record.option !== null),
    );
    ensure((record.side === value.streamerColor) === (record.roundId === null));
    ensure(
      apply(record.rolledDfen, record.moves, true) === record.resultingDfen,
    );
    prior = record.resultingDfen;
  }
  if (value.candidates !== null) {
    const set = value.candidates;
    object(set, 'request,status,reason,choices');
    object(set.request, 'sessionId,positionVersion,roundId,rolledDfen,seed');
    ensure(
      id(set.request.sessionId) &&
        set.request.roundId === value.roundId &&
        set.request.rolledDfen === value.rolledDfen &&
        integer(set.request.positionVersion) &&
        set.request.positionVersion <= value.positionVersion &&
        integer(set.request.seed, 2147483647),
    );
    ensure(
      ['ready', 'forced-pass'].includes(String(set.status)) &&
        ['complete', 'sampled', 'deadline'].includes(String(set.reason)),
    );
    ensure(Array.isArray(set.choices) && set.choices.length <= 3);
    ensure((set.status === 'ready') === set.choices.length > 0);
    for (const [index, candidate] of set.choices.entries()) {
      choice(candidate);
      ensure((candidate as { option: number }).option === index + 1);
      ensure(
        typeof value.rolledDfen === 'string' &&
          apply(
            value.rolledDfen,
            (candidate as { moves: string[] }).moves,
            true,
          ) === (candidate as { resultingDfen: string }).resultingDfen,
      );
    }
  }
  if (value.animation !== null) {
    object(value.animation, 'choice,reason,nextIndex');
    choice(value.animation.choice);
    ensure(
      ['single-choice', 'chat-choice'].includes(
        String(value.animation.reason),
      ) && integer(value.animation.nextIndex, 2),
    );
    const pending = value.animation.choice as { moves: string[] };
    ensure(
      value.animation.nextIndex < pending.moves.length &&
        value.moves.join(',') ===
          pending.moves.slice(0, value.animation.nextIndex).join(','),
    );
    ensure(id(value.roundId) && value.resolvedRounds.includes(value.roundId));
  }
  const effective = value.phase === 'paused' ? value.resumePhase : value.phase;
  if (effective === 'idle')
    ensure(
      value.rolledDfen === null &&
        value.roundId === null &&
        !value.moves.length &&
        !value.history.length &&
        value.animation === null &&
        value.candidates === null &&
        !value.pendingPass,
    );
  if (effective === 'preview' || effective === 'voting')
    ensure(
      value.animation === null &&
        !value.moves.length &&
        value.dfen === value.rolledDfen &&
        id(value.roundId) &&
        !value.resolvedRounds.includes(value.roundId),
    );
  ensure(effective === 'idle' ? value.gameId === null : id(value.gameId));
  if (effective === 'game-over') {
    const last = value.history.at(-1) as
      | { resultingDfen: string; rolledDfen: string; moves: string[] }
      | undefined;
    ensure(
      last &&
        value.dfen === last.resultingDfen &&
        value.rolledDfen === last.rolledDfen &&
        value.moves.join(',') === last.moves.join(','),
    );
    const board = value.dfen.split(' ')[0]!;
    ensure(
      value.winner === 'w'
        ? board.includes('K') && !board.includes('k')
        : value.winner === 'b' && board.includes('k') && !board.includes('K'),
    );
  } else {
    ensure(value.winner === null);
    if (effective !== 'idle') {
      ensure(
        value.rolledDfen === null
          ? value.dfen === prior && !value.moves.length
          : base(value.rolledDfen as string) === prior &&
              apply(value.rolledDfen as string, value.moves) === value.dfen,
      );
    }
  }
  if (
    ['preview', 'voting', 'chat-animation', 'resolving'].includes(
      String(effective),
    )
  )
    ensure(
      value.candidates !== null &&
        value.roundId !== null &&
        value.rolledDfen !== null,
    );
  if (effective === 'chat-animation' || effective === 'resolving')
    ensure(value.animation !== null);
  if (
    ['streamer-preparing', 'streamer-turn', 'chat-preparing'].includes(
      String(effective),
    )
  )
    ensure(value.rolledDfen !== null);
}

function decision(value: unknown) {
  object(value, 'roundId,closedAtMs,counts,leaders,seed,selectedIndex,winner');
  ensure(
    id(value.roundId) &&
      integer(value.closedAtMs) &&
      integer(value.seed, 4294967295),
  );
  ensure(
    Array.isArray(value.counts) &&
      value.counts.length >= 2 &&
      value.counts.length <= 3,
  );
  const counts: { option: number; votes: number }[] = [];
  for (const item of value.counts) {
    object(item, 'option,votes');
    ensure(
      integer(item.option, 3) && item.option > 0 && integer(item.votes, 100000),
    );
    counts.push({ option: item.option, votes: item.votes });
  }
  ensure(new Set(counts.map((count) => count.option)).size === counts.length);
  const max = Math.max(...counts.map((count) => count.votes));
  const leaders = counts
    .filter((count) => count.votes === max)
    .map((count) => count.option)
    .sort((a, b) => a - b);
  ensure(max > 0 && JSON.stringify(value.leaders) === JSON.stringify(leaders));
  ensure(
    integer(value.selectedIndex, leaders.length - 1) &&
      selectLeader(leaders, value.seed) === value.selectedIndex &&
      value.winner === leaders[value.selectedIndex],
  );
}

export function parseCheckpoint(value: unknown): SessionCheckpoint {
  object(value, 'version,message,game,voteDurationMs,decisions,requiresChat');
  ensure(
    value.version === 1 &&
      typeof value.message === 'string' &&
      value.message.trim().length > 0 &&
      value.message.length <= 160,
  );
  ensure(
    integer(value.voteDurationMs, 120000) &&
      value.voteDurationMs >= 5000 &&
      value.voteDurationMs % 1000 === 0 &&
      typeof value.requiresChat === 'boolean',
  );
  game(value.game);
  ensure(Array.isArray(value.decisions) && value.decisions.length <= 1000);
  value.decisions.forEach(decision);
  return structuredClone(value) as unknown as SessionCheckpoint;
}
