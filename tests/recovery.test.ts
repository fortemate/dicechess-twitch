import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiceChess } from '@fortemate/dicechess-engine';
import { Session } from '../src/host/session.ts';
import { FileStore } from '../src/host/file-store.ts';
import { parseCheckpoint } from '../src/host/checkpoint.ts';
import { fixtures } from './candidate-fixtures.ts';
import { twoCandidates } from './voting-fixtures.ts';
import { flush } from './twitch-fixtures.ts';
import { MemoryStore } from './recovery-fixtures.ts';

const tree = async (root: string) => DiceChess.getLegalTurnTree(root);
const pendingCandidates = () => new Promise<never>(() => {});
async function until(predicate: () => boolean) {
  for (let tick = 0; tick < 100; tick++) {
    if (predicate()) return;
    await flush();
  }
  assert.fail('Recovery did not reach its expected state');
}

test('checkpoint validation rejects unknown fields, impossible prefixes and unsupported versions without echoing data', () => {
  const session = new Session();
  try {
    const original = session.checkpoint();
    for (const value of [
      { ...original, version: 2 },
      { ...original, access_token: 'FIXTURE_NOT_A_REAL_CREDENTIAL' },
      { ...original, game: { ...original.game, moves: ['e2e4'] } },
      {
        ...original,
        game: { ...original.game, phase: 'paused', resumePhase: null },
      },
      { ...original, game: { ...original.game, dfen: 'invalid-position' } },
    ])
      assert.throws(() => parseCheckpoint(value), {
        message: 'Saved session is invalid or unsupported',
      });
    assert.deepEqual(parseCheckpoint(original), original);
  } finally {
    session.dispose();
  }
});

test('terminal king capture restores the winner and one history entry, then rematches with a fresh game id', async () => {
  const store = new MemoryStore();
  const source = new Session({
    store,
    tree,
    initialDfen: fixtures.tactical.split(' ').slice(0, 6).join(' '),
    roll: () => [1, 1, 5],
  });
  let restored: Session | undefined;
  try {
    source.game.start('w');
    source.game.roll();
    await until(() => source.snapshot().game.phase === 'streamer-turn');
    assert.equal(source.game.move('e7e8'), true);
    assert.equal(source.snapshot().game.phase, 'game-over');
    assert.equal(source.snapshot().storage.healthy, true);
    const finished = source.snapshot().game;
    source.dispose();
    restored = new Session({ store, tree });
    assert.equal(restored.snapshot().game.phase, 'game-over');
    assert.equal(restored.snapshot().game.winner, 'w');
    assert.equal(restored.checkpoint().game.history.length, 1);
    assert.equal(restored.game.resume(), false);
    assert.equal(restored.game.start('w'), true);
    assert.notEqual(restored.snapshot().game.gameId, finished.gameId);
    assert.equal(restored.checkpoint().game.history.length, 0);
    assert.equal(restored.snapshot().storage.healthy, true);
  } finally {
    source.dispose();
    restored?.dispose();
  }
});

test('file checkpoints replace atomically, retain private permissions and reject competing owners/corrupt data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dicechess-store-'));
  const file = join(directory, 'session.json');
  const store = new FileStore(file);
  const session = new Session();
  try {
    assert.equal(store.load(), undefined);
    const original = session.checkpoint();
    store.save(original);
    assert.deepEqual(store.load(), original);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.throws(() => new FileStore(file), /already in use/);
    store.save({ ...original, message: 'Second durable message' });
    assert.equal(store.load()?.message, 'Second durable message');
    const privateFixture = '{"access_token":"FIXTURE_NOT_A_REAL_CREDENTIAL"}';
    writeFileSync(file, privateFixture);
    assert.throws(() => store.load(), {
      message: 'Saved session is invalid or unsupported',
    });
    assert.equal(readFileSync(file, 'utf8'), privateFixture);
    store.close();
    writeFileSync(
      `${file}.lock`,
      JSON.stringify({ pid: 2147483647, nonce: 'fixture-stale-owner' }),
    );
    const recovered = new FileStore(file);
    try {
      assert.throws(
        () => new Session({ store: recovered }),
        /invalid or unsupported/,
      );
    } finally {
      recovered.close();
    }
    const fresh = new FileStore(file);
    fresh.close();
  } finally {
    session.dispose();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('partial streamer turn restores paused with the exact roll/prefix and fresh local authority', async () => {
  const store = new MemoryStore();
  const source = new Session({
    store,
    tree,
    roll: () => [1, 2, 5],
    candidates: pendingCandidates,
  });
  let restored: Session | undefined;
  try {
    source.game.start('w');
    source.game.roll();
    await until(() => source.snapshot().game.phase === 'streamer-turn');
    source.game.move('b1c3');
    const before = source.snapshot();
    assert.equal(before.storage.healthy, true);
    source.dispose();
    let rolls = 0;
    restored = new Session({
      store,
      tree,
      roll: () => {
        rolls++;
        return [1, 2, 5];
      },
      candidates: pendingCandidates,
    });
    assert.equal(restored.snapshot().game.phase, 'paused');
    assert.equal(restored.snapshot().game.dfen, before.game.dfen);
    assert.equal(restored.snapshot().game.rolledDfen, before.game.rolledDfen);
    assert.equal(
      restored.snapshot().game.positionVersion,
      before.game.positionVersion,
    );
    assert.notEqual(restored.snapshot().sessionId, before.sessionId);
    assert.equal(
      restored.apply({
        action: 'resume',
        sessionId: before.sessionId,
        expectedRevision: before.revision,
      }),
      undefined,
    );
    assert.equal(rolls, 0);
    assert.equal(restored.game.resume(), true);
    await until(() => restored!.snapshot().game.phase === 'streamer-turn');
    assert.equal(rolls, 0);
    assert.ok(!restored.operatorState().legalActions.includes('b1c3'));
    restored.game.move('e2e4');
    restored.game.move('d1e2');
    assert.equal(restored.snapshot().game.phase, 'chat-preparing');
    assert.equal(rolls, 1, 'only the new chat turn receives a roll');
    assert.deepEqual(restored.checkpoint().game.history[0]!.moves, [
      'b1c3',
      'e2e4',
      'd1e2',
    ]);
    assert.equal(restored.snapshot().storage.healthy, true);
    const frozen = restored.snapshot().game.rolledDfen;
    restored.dispose();
    restored = new Session({
      store,
      tree,
      roll: () => {
        throw new Error('Must reuse the frozen roll');
      },
      candidates: pendingCandidates,
    });
    restored.game.resume();
    assert.equal(restored.snapshot().game.rolledDfen, frozen);
    assert.equal(restored.checkpoint().game.history.length, 1);
  } finally {
    source.dispose();
    restored?.dispose();
  }
});

test('a forced pass prepared while paused is restored once without rolling that turn again', async () => {
  const store = new MemoryStore();
  let complete!: (tree: {}) => void;
  const source = new Session({
    store,
    initialDfen: fixtures.zero.split(' ').slice(0, 6).join(' '),
    roll: () => [1, 1, 1],
    tree: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    candidates: pendingCandidates,
  });
  let restored: Session | undefined;
  try {
    source.game.start('w');
    source.game.roll();
    source.game.pause();
    complete({});
    await flush();
    assert.equal(source.checkpoint().game.pendingPass, true);
    assert.equal(source.snapshot().storage.healthy, true);
    source.dispose();
    let rolls = 0;
    restored = new Session({
      store,
      tree,
      roll: () => {
        rolls++;
        return [1, 1, 1];
      },
      candidates: pendingCandidates,
    });
    assert.equal(restored.game.resume(), true);
    await until(() => restored!.checkpoint().game.history.length === 1);
    assert.equal(rolls, 1, 'only the new chat turn rolls');
    assert.equal(restored.checkpoint().game.history.length, 1);
    assert.equal(restored.checkpoint().game.history[0]!.reason, 'forced-pass');
    assert.deepEqual(restored.checkpoint().game.history[0]!.moves, []);
    assert.equal(restored.game.resume(), false);
  } finally {
    source.dispose();
    restored?.dispose();
  }
});

test('restoring interrupted voting keeps exact candidates under a new round and requires healthy explicit resume', async () => {
  const store = new MemoryStore();
  const source = new Session({
    store,
    tree,
    initialDfen: fixtures.two.split(' ').slice(0, 6).join(' '),
    roll: () => [1, 1, 1],
    candidates: twoCandidates,
  });
  let restored: Session | undefined;
  try {
    source.game.start('b');
    await until(() => source.snapshot().game.phase === 'preview');
    const before = source.snapshot().game;
    source.game.openVoting(before.roundId!);
    source.dispose();
    restored = new Session({
      store,
      tree,
      roll: () => {
        throw new Error('No reroll');
      },
      candidates: () => {
        throw new Error('No regeneration');
      },
    });
    assert.equal(restored.snapshot().game.phase, 'paused');
    assert.notEqual(restored.snapshot().game.roundId, before.roundId);
    assert.deepEqual(restored.snapshot().game.choices, before.choices);
    assert.equal(restored.snapshot().game.dfen, before.dfen);
    assert.equal(restored.snapshot().voting.totalVoters, 0);
    assert.equal(restored.game.resume(), false);
    restored.game.chatRestored(); // Programmatic test fixture; production requires verified Twitch health.
    assert.equal(restored.game.resume(), true);
    await until(() => restored!.snapshot().game.phase === 'preview');
    assert.deepEqual(restored.snapshot().game.choices, before.choices);
    assert.equal(restored.game.resolveChoice(before.roundId!, 1), false);
    assert.equal(restored.snapshot().storage.healthy, true);
  } finally {
    source.dispose();
    restored?.dispose();
  }
});

test('restart during animation resumes the next action once, preserving its decision and full history', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const store = new MemoryStore();
  const source = new Session({
    store,
    tree,
    initialDfen: fixtures.two.split(' ').slice(0, 6).join(' '),
    roll: () => [1, 1, 1],
    candidates: twoCandidates,
    animationStepMs: 10,
  });
  let restored: Session | undefined;
  try {
    source.game.start('b');
    await flush();
    const before = source.snapshot().game;
    source.game.openVoting(before.roundId!);
    source.game.resolveChoice(before.roundId!, 2);
    assert.equal(store.saved?.game.animation?.nextIndex, 0);
    context.mock.timers.tick(10);
    assert.equal(store.saved?.game.animation?.nextIndex, 1);
    const partial = source.snapshot().game;
    source.dispose();
    restored = new Session({
      store,
      tree,
      roll: () => {
        throw new Error('No reroll');
      },
      candidates: () => {
        throw new Error('No regeneration');
      },
      animationStepMs: 10,
    });
    assert.equal(restored.snapshot().game.dfen, partial.dfen);
    restored.game.resume();
    await flush();
    assert.equal(restored.snapshot().game.phase, 'chat-animation');
    for (let move = 1; move < before.choices[1]!.moves.length; move++)
      context.mock.timers.tick(10);
    assert.equal(restored.snapshot().game.phase, 'streamer-roll');
    assert.equal(
      restored.snapshot().game.dfen,
      before.choices[1]!.resultingDfen,
    );
    assert.equal(restored.checkpoint().game.history.length, 1);
    assert.deepEqual(
      restored.checkpoint().game.history[0]!.moves,
      before.choices[1]!.moves,
    );
    assert.equal(restored.game.resolveChoice(before.roundId!, 2), false);
    context.mock.timers.tick(10000);
    assert.equal(restored.checkpoint().game.history.length, 1);
    assert.equal(restored.snapshot().storage.healthy, true);
  } finally {
    source.dispose();
    restored?.dispose();
  }
});

test('storage failure before animation stops all move timers until an explicit successful save and resume', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const store = new MemoryStore();
  const session = new Session({
    store,
    tree,
    initialDfen: fixtures.two.split(' ').slice(0, 6).join(' '),
    roll: () => [1, 1, 1],
    candidates: twoCandidates,
    animationStepMs: 10,
  });
  try {
    session.game.start('b');
    await flush();
    const before = session.snapshot().game;
    session.game.openVoting(before.roundId!);
    store.fail = true;
    session.game.resolveChoice(before.roundId!, 1);
    assert.equal(session.snapshot().storage.healthy, false);
    assert.equal(session.snapshot().game.phase, 'paused');
    assert.equal(session.game.controls().canResume, false);
    context.mock.timers.tick(10000);
    assert.equal(session.snapshot().game.dfen, before.dfen);
    assert.ok(session.operatorState().canRetrySave);
    store.fail = false;
    const current = session.snapshot();
    assert.ok(
      session.apply({
        action: 'retry-save',
        sessionId: current.sessionId,
        expectedRevision: current.revision,
      }),
    );
    assert.equal(session.snapshot().game.phase, 'paused');
    assert.notEqual(session.snapshot().game.roundId, before.roundId);
    session.game.chatRestored();
    assert.equal(session.game.resume(), true);
    await flush();
    const round = session.snapshot().game.roundId!;
    assert.equal(session.game.openVoting(round), true);
    assert.equal(session.game.resolveChoice(round, 1), true);
    for (let move = 0; move < before.choices[0]!.moves.length; move++)
      context.mock.timers.tick(10);
    assert.equal(
      session.snapshot().game.dfen,
      before.choices[0]!.resultingDfen,
    );
    assert.equal(session.checkpoint().game.history.length, 1);
  } finally {
    session.dispose();
  }
});

test('an unsaved micro-move is rolled back before publication and a retry resumes from the durable cursor', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const store = new MemoryStore();
  const session = new Session({
    store,
    tree,
    initialDfen: fixtures.two.split(' ').slice(0, 6).join(' '),
    roll: () => [1, 1, 1],
    candidates: twoCandidates,
    animationStepMs: 10,
  });
  try {
    session.game.start('b');
    await flush();
    const before = session.snapshot().game;
    session.game.openVoting(before.roundId!);
    session.game.resolveChoice(before.roundId!, 1);
    const published: string[] = [];
    session.onChange(() => {
      published.push(session.snapshot().game.dfen);
    });
    store.fail = true;
    context.mock.timers.tick(10);
    assert.equal(session.snapshot().storage.healthy, false);
    assert.equal(session.snapshot().game.phase, 'paused');
    assert.equal(session.snapshot().game.dfen, before.dfen);
    assert.equal(session.checkpoint().game.animation?.nextIndex, 0);
    assert.ok(published.every((dfen) => dfen === before.dfen));
    store.fail = false;
    const state = session.snapshot();
    session.apply({
      action: 'retry-save',
      sessionId: state.sessionId,
      expectedRevision: state.revision,
    });
    session.game.resume();
    await flush();
    for (let move = 0; move < before.choices[0]!.moves.length; move++)
      context.mock.timers.tick(10);
    assert.equal(
      session.snapshot().game.dfen,
      before.choices[0]!.resultingDfen,
    );
    assert.equal(session.checkpoint().game.history.length, 1);
  } finally {
    session.dispose();
  }
});
