import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiceChess } from '@fortemate/dicechess-engine';

test('the pinned public engine can generate a legal complete-turn tree in Node', () => {
  const tree = DiceChess.getLegalTurnTree(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 PN',
  );
  assert.ok(Object.keys(tree).length > 0);
  assert.ok(Object.keys(tree['e2e4'] ?? {}).length > 0);
});
