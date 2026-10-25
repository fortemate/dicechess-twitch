import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Session } from '../src/host/session.ts';
import { parseCheckpoint } from '../src/host/checkpoint.ts';
import { isOperatorCommand } from '../src/shared/protocol.ts';
import { ruleStateKey } from '../src/engine/selection.ts';
import { fixtures } from './candidate-fixtures.ts';

test('checkpoint keys, command keys and dice identity do not depend on locale collation', (context) => {
  const session = new Session();
  try {
    const checkpoint = session.checkpoint();
    context.mock.method(String.prototype, 'localeCompare', () => {
      throw new Error('Canonical keys must not use locale collation');
    });
    const reordered = Object.fromEntries(Object.entries(checkpoint).reverse());
    assert.deepEqual(parseCheckpoint(reordered), checkpoint);
    const command = {
      uci: 'b1c3',
      sessionId: 'fixture-session',
      expectedRevision: 0,
      action: 'move',
    };
    assert.equal(isOperatorCommand(command), true);
    assert.equal(isOperatorCommand({ ...command, expectedrevision: 0 }), false);
    const base = fixtures.opening.split(' ').slice(0, 6).join(' ');
    assert.equal(ruleStateKey(`${base} QPN`), ruleStateKey(`${base} NPQ`));
    assert.equal(ruleStateKey(`${base} QPP`), ruleStateKey(`${base} PQP`));
  } finally {
    session.dispose();
  }
});
