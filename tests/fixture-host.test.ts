import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import type { PublicSnapshot } from '../src/shared/protocol.ts';
import type { OperatorGameState } from '../src/shared/game.ts';

test(
  'explicit rare-case fixture host stays disconnected/unsaved and exercises real engine outcomes',
  { timeout: 25000 },
  async () => {
    for (const scenario of [
      'forced-pass',
      'single-choice',
      'king-capture',
    ] as const) {
      const child = spawn(
        process.execPath,
        ['tests/rehearsal/host.ts', scenario],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            FIXTURE_OPERATOR_PORT: '0',
            FIXTURE_OBS_PORT: '0',
            TWITCH_CLIENT_ID: 'fixtureignoredclient000000000001',
          },
        },
      );
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.resume();
      const deadline = Date.now() + 15000;
      const until = async (condition: () => Promise<boolean> | boolean) => {
        while (Date.now() < deadline) {
          if (await condition()) return;
          if (child.exitCode !== null)
            throw new Error('Fixture host exited unexpectedly');
          await new Promise((done) => setTimeout(done, 20));
        }
        assert.fail('Fixture host timeout');
      };
      try {
        await until(() => output.includes('OBS: http://'));
        const operator = /Operator: (http:\/\/127\.0\.0\.1:\d+)/.exec(
          output,
        )![1]!;
        const obs = /OBS: (http:\/\/127\.0\.0\.1:\d+)/.exec(output)![1]!;
        const state = async () =>
          (await (await fetch(`${obs}/api/snapshot`)).json()) as PublicSnapshot;
        const initial = await state();
        assert.ok(initial.message.startsWith(`FIXTURE · ${scenario}`));
        assert.equal(initial.twitch.phase, 'not-configured');
        assert.equal(initial.storage.enabled, false);
        const authority = (await (
          await fetch(`${operator}/api/operator`, {
            headers: { 'X-Operator-Request': '1' },
          })
        ).json()) as { capability: string; operatorNote: string };
        assert.ok(authority.operatorNote.includes('NON-PRODUCTION FIXTURE'));
        const command = async (action: string, extra = {}) => {
          const current = await state();
          const response = await fetch(`${operator}/api/command`, {
            method: 'POST',
            headers: {
              Origin: operator,
              Authorization: `Bearer ${authority.capability}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action,
              sessionId: current.sessionId,
              expectedRevision: current.controlRevision,
              ...extra,
            }),
          });
          assert.equal(response.status, 200);
        };
        await command('start', {
          streamerColor: scenario === 'single-choice' ? 'b' : 'w',
        });
        if (scenario !== 'single-choice') await command('roll');
        if (scenario === 'king-capture') {
          await until(
            async () => (await state()).game.phase === 'streamer-turn',
          );
          const controls = (await (
            await fetch(`${operator}/api/operator/state`, {
              headers: { 'X-Operator-Request': '1' },
            })
          ).json()) as OperatorGameState;
          assert.ok(controls.legalActions.includes('e7e8'));
          await command('move', { uci: 'e7e8' });
          assert.equal((await state()).game.phase, 'game-over');
          assert.equal((await state()).game.winner, 'w');
        } else {
          await until(async () => {
            const current = await state();
            return (
              current.game.phase === 'streamer-roll' &&
              current.game.lastTurn?.reason ===
                (scenario === 'forced-pass' ? 'forced-pass' : 'single-choice')
            );
          });
        }
        assert.equal((await state()).twitch.phase, 'not-configured');
        assert.equal((await fetch(`${obs}/api/operator/state`)).status, 404);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit');
          child.kill('SIGTERM');
          await exited;
        }
      }
    }
  },
);
