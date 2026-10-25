import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { Worker } from 'node:worker_threads';
import { generateCandidates } from '../src/engine/generator.ts';
import { candidatePolicy } from '../src/engine/types.ts';
import type { CandidateResult, WorkerProgress } from '../src/engine/types.ts';
import { Session } from '../src/host/session.ts';
import { MemoryStore } from './recovery-fixtures.ts';
import { fixtures } from './candidate-fixtures.ts';
import { flush } from './twitch-fixtures.ts';

/** Inject a parent-side failure only after the real engine has completed a score.
 * No production worker hook or fake candidate implementation is introduced. */
function afterScore(context: TestContext, inject: (worker: Worker) => void) {
  const originalOn = Worker.prototype.on;
  let injected = false;
  context.mock.method(
    Worker.prototype,
    'on',
    function (
      this: Worker,
      event: string | symbol,
      listener: (...args: unknown[]) => void,
    ) {
      return originalOn.call(
        this,
        event,
        event === 'message'
          ? (...args: unknown[]) => {
              listener(...args);
              const progress = args[0] as WorkerProgress;
              if (
                !injected &&
                progress.type === 'progress' &&
                progress.status === 'ready'
              ) {
                injected = true;
                inject(this);
              }
            }
          : listener,
      );
    },
  );
  return () => injected;
}

async function until(predicate: () => boolean) {
  const deadline = performance.now() + 10000;
  while (!predicate() && performance.now() < deadline) await flush();
  assert.ok(predicate(), 'Engine transition did not complete');
}

for (const event of ['error', 'exit'] as const) {
  test(
    `worker ${event} after progress pauses as an engine failure; durable retry keeps the roll`,
    { timeout: 15000 },
    async (context) => {
      const injected = afterScore(context, (worker) => {
        if (event === 'error')
          worker.emit('error', new Error('FIXTURE_PRIVATE_WORKER_ERROR'));
        else worker.emit('exit', 1);
      });
      const results: CandidateResult[] = [];
      const store = new MemoryStore();
      let rolls = 0;
      const session = new Session({
        store,
        initialDfen: fixtures.two.split(' ').slice(0, 6).join(' '),
        roll: () => {
          rolls++;
          return [1, 1, 1];
        },
        previewStepMs: 10000,
        candidates: async (request, options) => {
          const result = await generateCandidates(request, options);
          results.push(result);
          return result;
        },
      });
      try {
        session.game.start('b');
        const original = session.snapshot().game;
        await until(() => session.snapshot().game.phase === 'paused');
        assert.ok(injected());
        assert.equal(results[0]!.reason, 'worker-error');
        assert.equal(results[0]!.status, 'unavailable');
        assert.deepEqual(results[0]!.choices, []);
        assert.deepEqual(results[0]!.analysis.scored, []);
        assert.equal(session.snapshot().storage.healthy, true);
        assert.equal(session.operatorState().canRetrySave, false);
        assert.equal(session.operatorState().canResume, true);
        assert.match(
          session.snapshot().game.announcement,
          /Engine preparation failed/,
        );
        assert.ok(
          !JSON.stringify(session.snapshot()).includes(
            'FIXTURE_PRIVATE_WORKER_ERROR',
          ),
        );
        assert.equal(session.game.resume(), true);
        await until(() => session.snapshot().game.phase === 'preview');
        assert.equal(rolls, 1);
        assert.equal(session.snapshot().game.rolledDfen, original.rolledDfen);
        assert.equal(session.snapshot().game.roundId, original.roundId);
        assert.equal(session.snapshot().storage.healthy, true);
        assert.equal(results[1]!.status, 'ready');
        assert.ok(session.snapshot().game.choices.length);
        assert.deepEqual(store.saved, session.checkpoint());
      } finally {
        session.dispose();
      }
    },
  );
}

test(
  'hard deadline after a real completed score retains the completed fallback',
  { timeout: 10000 },
  async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const injected = afterScore(context, () =>
      context.mock.timers.tick(candidatePolicy.hardDeadlineMs),
    );
    const result = await generateCandidates({
      sessionId: 'fixture-session',
      positionVersion: 1,
      roundId: 'fixture-round',
      rolledDfen: fixtures.two,
      seed: 123,
    });
    assert.ok(injected());
    assert.equal(result.status, 'ready');
    assert.equal(result.reason, 'deadline');
    assert.equal(result.analysis.scored.length, 1);
    assert.equal(result.choices.length, 1);
    assert.equal(
      result.choices[0]!.resultingDfen,
      result.analysis.scored[0]!.resultingDfen,
    );
  },
);
