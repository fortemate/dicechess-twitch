import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { DiceChess } from '@fortemate/dicechess-engine';
import type { MoveTree } from '@fortemate/dicechess-engine';
import { generateCandidates } from '../src/engine/generator.ts';
import { enumerateTurns, applyUci } from '../src/engine/search.ts';
import { ruleStateKey, selectTurns, shuffle } from '../src/engine/selection.ts';
import { candidatePolicy } from '../src/engine/types.ts';
import type {
  CandidateRequest,
  CandidateResult,
  ScoredTurn,
} from '../src/engine/types.ts';
import { startHost } from '../src/host/server.ts';
import { fixtures } from './candidate-fixtures.ts';

function request(rolledDfen: string): CandidateRequest {
  return {
    sessionId: 'session-a',
    positionVersion: 7,
    roundId: 'round-a',
    rolledDfen,
    seed: 17,
  };
}
function assertComplete(result: CandidateResult) {
  for (const choice of result.choices) {
    let node: MoveTree = DiceChess.getLegalTurnTree(result.request.rolledDfen);
    let state = result.request.rolledDfen;
    for (const uci of choice.moves) {
      assert.ok(Object.hasOwn(node, uci), `Illegal continuation ${uci}`);
      node = node[uci]!;
      state = applyUci(state, uci);
    }
    assert.equal(
      Object.keys(node).length,
      0,
      'Every choice must reach a full-turn leaf',
    );
    const terminal = !state
      .split(' ')[0]!
      .includes(result.request.rolledDfen.split(' ')[1] === 'w' ? 'k' : 'K');
    assert.equal(
      choice.resultingDfen,
      terminal ? state : DiceChess.endTurn(state),
    );
  }
}

test(
  'the built Node adapter finds its compiled worker and produces a legal turn',
  { timeout: 10000 },
  async () => {
    const moduleUrl = pathToFileURL(
      resolve('dist/host/candidate-generator.js'),
    ).href;
    const built = (await import(
      moduleUrl
    )) as typeof import('../src/engine/generator.ts');
    const result = await built.generateCandidates(request(fixtures.one));
    assert.equal(result.status, 'ready');
    assert.equal(result.choices.length, 1);
    assertComplete(result);
  },
);

test(
  'opening yields three complete distinct outcomes, retaining the maximum common-basis score',
  { timeout: 15000 },
  async () => {
    const result = await generateCandidates(request(fixtures.opening));
    assert.equal(result.status, 'ready');
    assert.equal(result.choices.length, 3);
    assertComplete(result);
    assert.equal(
      new Set(
        result.choices.map((choice) => ruleStateKey(choice.resultingDfen)),
      ).size,
      3,
    );
    const strongest = [...result.analysis.scored].sort(
      (a, b) => b.utility - a.utility,
    )[0]!;
    assert.ok(
      result.choices.some(
        (choice) => ruleStateKey(choice.resultingDfen) === strongest.ruleKey,
      ),
    );
    assert.ok(
      result.choices.every(
        (choice) =>
          result.analysis.scored.find(
            (turn) => turn.ruleKey === ruleStateKey(choice.resultingDfen),
          )!.utility >=
          strongest.utility - candidatePolicy.qualityMargin,
      ),
    );
    assert.ok(
      Object.isFrozen(result) &&
        Object.isFrozen(result.choices) &&
        Object.isFrozen(result.choices[0]!.moves),
    );
    assert.deepEqual(Object.keys(result.choices[0]!).sort(), [
      'moves',
      'option',
      'resultingDfen',
    ]);
    assert.ok(!JSON.stringify(result.choices).includes('utility'));
    assert.deepEqual(result.request, request(fixtures.opening));
  },
);

test('independent micro-move reorderings collapse to one card despite diagnostic clock differences', () => {
  const all = enumerateTurns(fixtures.opening, candidatePolicy.pathLimit);
  assert.ok(all.paths > all.turns.length);
  const first = ['a2a3', 'b1c3'].reduce(applyUci, fixtures.opening as string);
  const second = ['b1c3', 'a2a3'].reduce(applyUci, fixtures.opening as string);
  const a = DiceChess.endTurn(first)!;
  const b = DiceChess.endTurn(second)!;
  assert.notEqual(a, b, 'This fixture exercises differing half-move clocks');
  assert.equal(ruleStateKey(a), ruleStateKey(b));
  assert.equal(
    all.turns.filter((turn) => turn.ruleKey === ruleStateKey(a)).length,
    1,
  );
});

test('rule-state key preserves orientation, side, castling, en passant and remaining dice', () => {
  const base = '4k3/8/8/8/8/8/8/4K3 w - - 0 1 PN';
  assert.equal(
    ruleStateKey(base),
    ruleStateKey(base.replace('0 1 PN', '8 9 NP')),
  );
  for (const other of [
    base.replace(' w ', ' b '),
    base.replace(' w - ', ' w K '),
    base.replace(' - 0', ' e3 0'),
    base.replace(' PN', ' P'),
    base.replace('4K3', '3K4'),
  ])
    assert.notEqual(ruleStateKey(base), ruleStateKey(other));
});

test('frozen-root paths enforce maximal dice use and include one-action two-die castling', () => {
  const maximal = enumerateTurns(fixtures.maximal, candidatePolicy.pathLimit);
  assert.equal(maximal.turns.length, 4);
  assert.ok(
    maximal.turns.every(
      (turn) =>
        turn.moves.length === 2 && turn.moves[1]!.match(/^(a1b1|h1g1)$/),
    ),
  );
  const castling = enumerateTurns(fixtures.castling, candidatePolicy.pathLimit);
  for (const uci of ['e1g1', 'e1c1']) {
    const castle = castling.turns.find(
      (turn) => turn.moves.length === 1 && turn.moves[0] === uci,
    );
    assert.ok(
      castle,
      `${uci} spends both king and rook dice in one micro-move`,
    );
    assert.equal(castle.resultingDfen.split(' ')[2], '-');
    assert.equal(castle.resultingDfen.split(' ').length, 6);
  }
});

test('promotion alternatives and en-passant capture are applied by the public engine', () => {
  const promotions = enumerateTurns(
    fixtures.promotion,
    candidatePolicy.pathLimit,
  );
  assert.deepEqual(promotions.turns.map((turn) => turn.moves[0]).sort(), [
    'a7a8b',
    'a7a8n',
    'a7a8q',
    'a7a8r',
  ]);
  assert.equal(new Set(promotions.turns.map((turn) => turn.ruleKey)).size, 4);
  const capture = enumerateTurns(
    fixtures.enPassant,
    candidatePolicy.pathLimit,
  ).turns.find((turn) => turn.moves[0] === 'e5d6')!;
  assert.ok(capture);
  assert.equal(capture.resultingDfen.split(' ')[0], '4k3/8/3P4/8/8/8/8/4K3');
});

test(
  'king capture ends immediately with the original mover and unspent dice',
  { timeout: 10000 },
  async () => {
    const result = await generateCandidates(request(fixtures.tactical));
    assert.equal(result.status, 'ready');
    assert.equal(result.choices.length, 1);
    assert.deepEqual(result.choices[0]!.moves, ['e7e8']);
    assert.equal(result.choices[0]!.resultingDfen.split(' ')[1], 'w');
    assert.equal(result.choices[0]!.resultingDfen.split(' ')[6], 'P');
    assertComplete(result);
  },
);

test('unused terminal dice cannot manufacture separate winning cards', () => {
  const terminal = '4Q3/8/8/8/8/8/8/4K3 w - - 0 1 QQ';
  assert.equal(
    ruleStateKey(terminal),
    ruleStateKey(terminal.replace(' QQ', ' Q')),
  );
  const high = enumerateTurns(
    fixtures.highBranching,
    candidatePolicy.pathLimit,
  );
  assert.ok(high.paths > 10000);
  assert.equal(high.turns.filter((turn) => turn.terminalWin).length, 1);
});

test(
  'real engine equity rejects alternatives that expose the king',
  { timeout: 10000 },
  async () => {
    const result = await generateCandidates(request(fixtures.kingSafety));
    assert.equal(result.status, 'ready');
    assert.equal(
      result.choices.length,
      1,
      'Do not pad a poll with clearly inferior moves',
    );
    assert.deepEqual(result.choices[0]!.moves, ['e2e7']);
    assert.ok(
      result.analysis.scored.some(
        (turn) =>
          turn.moves[0] === 'e2a2' &&
          turn.utility <
            result.analysis.scored[0]!.utility - candidatePolicy.qualityMargin,
      ),
    );
  },
);

test(
  'zero, one and two outcomes are returned honestly without padding',
  { timeout: 15000 },
  async () => {
    for (const [name, count] of [
      ['zero', 0],
      ['one', 1],
      ['two', 2],
    ] as const) {
      const result = await generateCandidates(request(fixtures[name]));
      assert.equal(result.status, count ? 'ready' : 'forced-pass');
      assert.equal(result.choices.length, count);
      assertComplete(result);
    }
  },
);

test(
  'invalid/missing rolls, cancellation and hard timeout never masquerade as forced pass',
  { timeout: 10000 },
  async () => {
    for (const dfen of [
      'invalid',
      fixtures.opening.split(' ').slice(0, 6).join(' '),
      fixtures.opening.replace('PN', 'pnbq'),
    ]) {
      const result = await generateCandidates(request(dfen));
      assert.equal(result.status, 'unavailable');
      assert.equal(result.reason, 'invalid-position');
    }
    const timeout = await generateCandidates(request(fixtures.opening), {
      policy: { ...candidatePolicy, hardDeadlineMs: 1 },
    });
    assert.equal(timeout.status, 'unavailable');
    assert.equal(timeout.reason, 'deadline');
    const controller = new AbortController();
    const pending = generateCandidates(request(fixtures.highBranching), {
      signal: controller.signal,
    });
    controller.abort();
    const cancelled = await pending;
    assert.equal(cancelled.status, 'unavailable');
    assert.equal(cancelled.reason, 'cancelled');
    assert.equal(cancelled.choices.length, 0);
  },
);

test(
  'the host keeps serving authoritative snapshots while its worker searches',
  { timeout: 15000 },
  async () => {
    const host = await startHost({
      operatorPort: 0,
      obsPort: 0,
      clientDirectory: resolve('dist/client'),
    });
    try {
      const source = request(fixtures.opening);
      const pending = generateCandidates(source);
      source.roundId = 'later-round';
      source.positionVersion = 99;
      const first = await Promise.race([
        fetch(`${host.obsUrl}/api/snapshot`).then(() => 'host'),
        pending.then(() => 'worker'),
      ]);
      assert.equal(first, 'host');
      const result = await pending;
      assert.equal(result.request.roundId, 'round-a');
      assert.equal(result.request.positionVersion, 7);
      assert.equal(result.status, 'ready');
    } finally {
      await host.close();
    }
  },
);

test('quality band removes bad outliers, diversity breaks eligible ties, shuffle does not rerank', () => {
  const turn = (key: string, utility: number, dfen: string): ScoredTurn => ({
    moves: [key],
    ruleKey: key,
    utility,
    resultingDfen: dfen,
    terminalWin: false,
  });
  const best = turn('a1a2', 0.8, fixtures.one);
  const near = turn('a1b1', 0.79, fixtures.one.replace('P7', '1P6'));
  const different = turn(
    'a1c1',
    0.79,
    fixtures.one.replace('P7', '2P5').replace('7K', '6K1'),
  );
  const bad = turn('a1d1', 0.2, fixtures.zero);
  const selected = selectTurns([bad, near, different, best], 0.08);
  assert.equal(selected[0], best);
  assert.equal(selected[1], different);
  assert.ok(!selected.includes(bad));
  assert.deepEqual(new Set(shuffle(selected, 17)), new Set(selected));
  assert.deepEqual(shuffle(selected, 17), shuffle(selected, 17));
  assert.notDeepEqual(shuffle(selected, 17), shuffle(selected, 19));
});
