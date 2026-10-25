import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiceChess } from '@fortemate/dicechess-engine';
import type { MoveTree } from '@fortemate/dicechess-engine';
import { Game } from '../src/host/game.ts';
import { enumerateTurns } from '../src/engine/search.ts';
import type { CandidateRequest, CandidateResult } from '../src/engine/types.ts';
import { fixtures } from './candidate-fixtures.ts';

type Options = ConstructorParameters<typeof Game>[0];
const unrolled = (dfen: string) => dfen.split(' ').slice(0, 6).join(' ');
const tree: NonNullable<Options['tree']> = async (dfen) =>
  DiceChess.getLegalTurnTree(dfen);
const neverCandidates: NonNullable<Options['candidates']> = () =>
  new Promise(() => {});
function set(request: CandidateRequest, count = 3): CandidateResult {
  const legal = enumerateTurns(request.rolledDfen, 25000);
  const turns = legal.turns.slice(0, count);
  return {
    request: { ...request },
    status: turns.length ? 'ready' : 'forced-pass',
    reason: 'complete',
    choices: turns.map((turn, index) => ({
      option: index + 1,
      moves: turn.moves,
      resultingDfen: turn.resultingDfen,
    })),
    analysis: {
      basis: 'engine-equity-v1',
      scored: turns.map((turn) => ({ ...turn, utility: 0.5 })),
      legalPaths: legal.paths,
      uniqueStates: legal.turns.length,
      elapsedMs: 1,
    },
  };
}
function make(options: Partial<Options> = {}) {
  return new Game({
    sessionId: 'session',
    changed: () => {},
    tree,
    candidates: neverCandidates,
    roll: () => [1, 2, 5],
    autoplayDelayMs: 10,
    animationStepMs: 1,
    ...options,
  });
}
async function until(predicate: () => boolean) {
  for (let index = 0; index < 300; index++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('Game did not reach the expected state');
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('streamer follows the frozen maximal tree, cannot reroll, and hands one frozen roll to chat', async () => {
  let rolls = 0;
  const requests: CandidateRequest[] = [];
  const game = make({
    roll: () => {
      rolls++;
      return [5, 4, 2];
    },
    candidates: (request) => {
      requests.push({ ...request });
      return new Promise(() => {});
    },
  });
  try {
    assert.equal(game.roll(), false);
    assert.equal(game.start('w'), true);
    assert.equal(game.start('b'), false);
    assert.equal(game.roll(), true);
    assert.equal(game.roll(), false);
    await until(() => game.snapshot().phase === 'streamer-turn');
    const original = game.snapshot().rolledDfen;
    assert.equal(game.move('e2e4'), false, 'A pawn cannot move on QRN');
    assert.equal(game.move('b1a3'), true);
    assert.deepEqual(game.controls().legalActions, ['a1b1']);
    assert.equal(game.move('g1f3'), false);
    assert.equal(game.roll(), false);
    assert.equal(game.snapshot().rolledDfen, original);
    assert.equal(rolls, 1);
    assert.equal(game.move('a1b1'), true);
    assert.equal(game.snapshot().phase, 'chat-preparing');
    assert.equal(rolls, 2);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.rolledDfen, game.snapshot().dfen);
    assert.equal(requests[0]!.roundId, game.snapshot().roundId);
    assert.equal(game.roll(), false);
    assert.deepEqual(game.snapshot().lastTurn?.moves, ['b1a3', 'a1b1']);
  } finally {
    game.dispose();
  }
});

test('promotions and two-die castling are operator-selectable legal tree actions', async () => {
  const castling = make({
    initialDfen: unrolled(fixtures.castling),
    roll: () => [4, 5, 6],
  });
  const promotion = make({
    initialDfen: unrolled(fixtures.promotion),
    roll: () => [1, 6, 6],
  });
  try {
    castling.start('w');
    castling.roll();
    await until(() => castling.snapshot().phase === 'streamer-turn');
    assert.ok(castling.controls().legalActions.includes('e1g1'));
    assert.equal(castling.move('e1g1'), true);
    assert.equal(castling.snapshot().lastTurn?.moves.length, 1);
    assert.equal(
      castling.snapshot().lastTurn?.resultingDfen.split(' ')[2],
      '-',
    );
    promotion.start('w');
    promotion.roll();
    await until(() => promotion.snapshot().phase === 'streamer-turn');
    for (const piece of ['q', 'r', 'b', 'n'])
      assert.ok(promotion.controls().legalActions.includes(`a7a8${piece}`));
    assert.equal(promotion.move('a7a8n'), true);
    while (promotion.snapshot().phase === 'streamer-turn')
      assert.equal(promotion.move(promotion.controls().legalActions[0]!), true);
    assert.equal(promotion.snapshot().lastTurn?.moves[0], 'a7a8n');
  } finally {
    castling.dispose();
    promotion.dispose();
  }
});

test('a legal-tree result can arrive while paused without enabling moves or rerolling', async () => {
  const ready = deferred<MoveTree | undefined>();
  const game = make({ tree: () => ready.promise });
  try {
    game.start('w');
    game.roll();
    const rolled = game.snapshot().dfen;
    assert.equal(game.pause(), true);
    ready.resolve(DiceChess.getLegalTurnTree(rolled));
    await until(() => game.snapshot().resumePhase === 'streamer-turn');
    assert.equal(game.snapshot().phase, 'paused');
    assert.deepEqual(game.controls().legalActions, []);
    assert.equal(game.move('e2e4'), false);
    assert.equal(game.roll(), false);
    assert.equal(game.resume(), true);
    assert.equal(game.snapshot().phase, 'streamer-turn');
    assert.equal(game.snapshot().dfen, rolled);
    assert.equal(game.roll(), false);
  } finally {
    game.dispose();
  }
});

test('chat resolution is exactly once across duplicate callbacks, pause and animation', async () => {
  const game = make({
    initialDfen: unrolled(fixtures.two),
    roll: () => [1, 1, 1],
    candidates: async (request) => set(request, 2),
    animationStepMs: 10,
  });
  try {
    game.start('b');
    await until(() => game.snapshot().phase === 'preview');
    const prepared = game.snapshot();
    const round = prepared.roundId!;
    assert.equal(prepared.choices.length, 2);
    assert.equal(
      prepared.dfen,
      prepared.rolledDfen,
      'Preview must not mutate the board',
    );
    assert.equal(game.openVoting('old-round'), false);
    assert.equal(game.openVoting(round), true);
    assert.equal(game.move('d2d3'), false);
    assert.equal(game.roll(), false);
    assert.equal(game.resolveChoice('old-round', 1), false);
    assert.equal(game.resolveChoice(round, 1), true);
    assert.equal(game.resolveChoice(round, 2), false);
    assert.equal(game.pause(), true);
    const paused = game.snapshot();
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.deepEqual(game.snapshot(), paused);
    assert.equal(game.resolveChoice(round, 1), false);
    game.resume();
    await until(() => game.snapshot().phase === 'streamer-roll');
    const final = game.snapshot();
    assert.equal(final.dfen, prepared.choices[0]!.resultingDfen);
    assert.equal(final.lastTurn?.roundId, round);
    assert.equal(final.lastTurn?.reason, 'chat-choice');
    assert.equal(game.resolveChoice(round, 1), false);
    assert.deepEqual(game.snapshot(), final);
  } finally {
    game.dispose();
  }
});

test('single retained choice is explained and cannot auto-play while paused', async () => {
  const ready = deferred<CandidateResult>();
  let input: CandidateRequest | undefined;
  const game = make({
    initialDfen: unrolled(fixtures.one),
    roll: () => [1, 1, 1],
    autoplayDelayMs: 25,
    candidates: (request) => {
      input = request;
      return ready.promise;
    },
  });
  try {
    game.start('b');
    game.pause();
    const original = game.snapshot().dfen;
    ready.resolve(set(input!, 1));
    await until(() => game.snapshot().resumePhase === 'preview');
    assert.match(game.snapshot().announcement, /One retained engine choice/);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(game.snapshot().dfen, original);
    assert.equal(game.snapshot().lastTurn, null);
    game.resume();
    await until(() => game.snapshot().phase === 'streamer-roll');
    assert.equal(game.snapshot().lastTurn?.reason, 'single-choice');
  } finally {
    game.dispose();
  }
});

test('empty legal rolls force passes, with one roll per side and no invented choice', async () => {
  let rolls = 0;
  const game = make({
    initialDfen: unrolled(fixtures.zero),
    roll: () => {
      rolls++;
      return [1, 1, 1];
    },
    candidates: async (request) => set(request),
  });
  try {
    game.start('w');
    game.roll();
    await until(
      () =>
        game.snapshot().phase === 'streamer-roll' &&
        game.snapshot().lastTurn !== null,
    );
    assert.equal(rolls, 2);
    assert.equal(game.snapshot().lastTurn?.reason, 'forced-pass');
    assert.equal(game.snapshot().lastTurn?.side, 'b');
    assert.equal(game.snapshot().dfen.split(' ')[1], 'w');
    assert.deepEqual(game.snapshot().choices, []);
  } finally {
    game.dispose();
  }
});

test('king capture immediately ends play, rejects later moves and permits rematch', async () => {
  const game = make({
    initialDfen: unrolled(fixtures.tactical),
    roll: () => [5, 1, 1],
  });
  try {
    game.start('w');
    game.roll();
    await until(() => game.snapshot().phase === 'streamer-turn');
    assert.equal(game.move('e7e8'), true);
    const over = game.snapshot();
    assert.equal(over.phase, 'game-over');
    assert.equal(over.winner, 'w');
    assert.equal(over.dfen.split(' ')[1], 'w');
    assert.equal(over.dfen.split(' ')[6], 'PP');
    assert.equal(game.roll(), false);
    assert.equal(game.move('e8e7'), false);
    assert.equal(game.pause(), false);
    assert.equal(game.controls().canRematch, true);
    assert.equal(game.start('w'), true);
    assert.notEqual(game.snapshot().gameId, over.gameId);
    assert.ok(game.snapshot().positionVersion > over.positionVersion);
    assert.equal(game.snapshot().winner, null);
  } finally {
    game.dispose();
  }
});

test('wrong-round preparation is rejected; resume retries the same roll without regeneration during a vote', async () => {
  let calls = 0;
  let rolls = 0;
  const requests: CandidateRequest[] = [];
  const game = make({
    initialDfen: unrolled(fixtures.two),
    roll: () => {
      rolls++;
      return [1, 1, 1];
    },
    candidates: async (request) => {
      calls++;
      requests.push({ ...request });
      const result = set(request, 2);
      return calls === 1
        ? { ...result, request: { ...request, roundId: 'obsolete' } }
        : result;
    },
  });
  try {
    game.start('b');
    await until(() => game.snapshot().phase === 'paused');
    assert.deepEqual(game.snapshot().choices, []);
    game.resume();
    await until(() => game.snapshot().phase === 'preview');
    assert.equal(rolls, 1);
    assert.equal(calls, 2);
    assert.equal(requests[0]!.rolledDfen, requests[1]!.rolledDfen);
    assert.equal(requests[0]!.roundId, requests[1]!.roundId);
    const round = game.snapshot().roundId!;
    game.openVoting(round);
    game.pause();
    game.resume();
    assert.equal(calls, 2);
    assert.equal(rolls, 1);
    assert.ok(!JSON.stringify(game.snapshot()).includes('utility'));
    assert.ok(!JSON.stringify(game.snapshot()).includes('legalActions'));
  } finally {
    game.dispose();
  }
});

test('disposed sessions ignore late asynchronous results', async () => {
  const ready = deferred<CandidateResult>();
  let input: CandidateRequest | undefined;
  const game = make({
    initialDfen: unrolled(fixtures.two),
    roll: () => [1, 1, 1],
    candidates: (request) => {
      input = request;
      return ready.promise;
    },
  });
  game.start('b');
  game.dispose();
  const stopped = game.snapshot();
  ready.resolve(set(input!, 2));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(game.snapshot(), stopped);
});
