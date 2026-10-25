import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enumerateTurns } from '../src/engine/search.ts';
import { presentChoices } from '../src/presentation/sequence.ts';
import { Session } from '../src/host/session.ts';
import { fixtures } from './candidate-fixtures.ts';
import { twoCandidates } from './voting-fixtures.ts';
import { flush } from './twitch-fixtures.ts';

function choice(root: string, move: string) {
  const turn = enumerateTurns(root, 25000).turns.find(
    (turn) => turn.moves[0] === move,
  )!;
  assert.ok(turn, `Engine fixture must contain ${move}`);
  return { option: 1, moves: turn.moves, resultingDfen: turn.resultingDfen };
}
test('presentation shows actual engine-approved promotion, en passant, castling and king capture', () => {
  for (const [root, move, expected, capture, promotion] of [
    [fixtures.promotion, 'a7a8n', 'promotes to knight', null, 'knight'],
    [fixtures.enPassant, 'e5d6', 'captures pawn', 'pawn', null],
    [fixtures.castling, 'e1g1', 'Castle kingside', null, null],
    [fixtures.tactical, 'e7e8', 'captures king', 'king', null],
  ] as const) {
    const selected = choice(root, move);
    const result = presentChoices(root, [selected]);
    assert.equal(result.frames[0]!.dfen, root);
    assert.equal(result.frames.at(-1)!.dfen, selected.resultingDfen);
    assert.ok(result.choices[0]!.moves[0]!.label.includes(expected));
    assert.equal(result.choices[0]!.moves[0]!.captured, capture);
    assert.equal(result.choices[0]!.moves[0]!.promotion, promotion);
    assert.equal(result.frames.length, selected.moves.length + 2);
    assert.ok(!JSON.stringify(result).includes('utility'));
  }
});
test('preview validates its final result and starts every alternative at the true root', () => {
  const root = fixtures.opening;
  const choices = enumerateTurns(root, 25000)
    .turns.slice(0, 3)
    .map((turn, index) => ({
      option: index + 1,
      moves: turn.moves,
      resultingDfen: turn.resultingDfen,
    }));
  const result = presentChoices(root, choices);
  assert.deepEqual(
    result.frames
      .filter((frame) => frame.step === 0)
      .map((frame) => frame.dfen),
    [root, root, root],
  );
  assert.deepEqual(
    result.choices.map((item) => item.option),
    [1, 2, 3],
  );
  assert.throws(
    () => presentChoices(root, [{ ...choices[0]!, resultingDfen: root }]),
    /mismatch/,
  );
});
test('host previews never commit moves; pause freezes a frame and single-choice auto-play waits for completion', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const session = new Session({
    initialDfen: fixtures.two.split(' ').slice(0, 6).join(' '),
    roll: () => [1, 1, 1],
    candidates: async (request) => {
      const result = await twoCandidates(request);
      return { ...result, choices: result.choices.slice(0, 1) };
    },
    previewStepMs: 10,
    animationStepMs: 1,
  });
  try {
    session.game.start('b');
    await flush();
    const root = session.snapshot().game;
    const frames: string[] = [];
    session.onChange(() => {
      const state = session.snapshot();
      if (state.game.phase === 'preview') {
        assert.equal(state.game.dfen, root.dfen);
        assert.equal(state.game.positionVersion, root.positionVersion);
        frames.push(state.preview.dfen!);
      }
    });
    context.mock.timers.tick(10);
    assert.notEqual(session.snapshot().preview.dfen, root.dfen);
    session.game.pause();
    const paused = session.snapshot().preview;
    context.mock.timers.tick(10000);
    assert.deepEqual(session.snapshot().preview, paused);
    assert.equal(session.snapshot().game.dfen, root.dfen);
    session.game.resume();
    for (
      let step = 0;
      step < 30 && session.snapshot().game.phase === 'preview';
      step++
    )
      context.mock.timers.tick(10);
    assert.equal(session.snapshot().preview.phase, 'complete');
    assert.equal(session.snapshot().preview.dfen, root.rolledDfen);
    assert.equal(session.snapshot().game.phase, 'chat-animation');
    assert.ok(frames.some((frame) => frame !== root.dfen));
    for (let step = 0; step < root.choices[0]!.moves.length + 1; step++)
      context.mock.timers.tick(1);
    assert.equal(session.snapshot().game.lastTurn?.option, 1);
    assert.equal(session.snapshot().game.lastTurn?.reason, 'single-choice');
    assert.equal(session.snapshot().game.dfen, root.choices[0]!.resultingDfen);
  } finally {
    session.dispose();
  }
});
