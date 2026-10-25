import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { DiceChess } from '@fortemate/dicechess-engine';
import { Session } from '../../src/host/session.ts';
import { FileStore } from '../../src/host/file-store.ts';
import { parseCheckpoint } from '../../src/host/checkpoint.ts';
import type { OperatorCommand } from '../../src/shared/protocol.ts';
import {
  authFixture,
  clientId,
  FakeSocket,
  flush,
  packet,
  welcome,
} from '../twitch-fixtures.ts';
import { vote, voteFrame } from '../voting-fixtures.ts';

// Explicit opt-in rehearsal, outside the default tests/*.test.ts glob. It never
// starts HTTP listeners, reads production launch configuration or contacts Twitch.
const startedAt = new Date().toISOString();
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const trackedChanges =
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  }).trim().length > 0;
const parent = resolve('.local/rehearsals');
mkdirSync(parent, { recursive: true });
const evidence = mkdtempSync(join(parent, 'full-game-'));
console.log(`FIXTURE ONLY: accelerated headless games. Evidence: ${evidence}`);

for (const [streamerColor, diceSeed] of [
  ['w', 1],
  ['b', 2],
] as const) {
  test(
    `full starting-position game, streamer ${streamerColor}, fixture dice seed ${diceSeed}`,
    { timeout: 300000 },
    async (context) => {
      context.mock.timers.enable({
        apis: ['Date', 'setTimeout'],
        now: Date.parse('2026-10-25T02:00:00Z'),
      });
      let random = diceSeed as number;
      const roll = () =>
        Array.from({ length: 3 }, () => {
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
          return (random % 6) + 1;
        });
      const sockets: FakeSocket[] = [];
      const stateFile = join(evidence, `${streamerColor}-checkpoint.json`);
      const session = new Session({
        store: new FileStore(stateFile),
        roll,
        twitchClientId: clientId,
        twitchFetch: authFixture().fetcher,
        twitchSocket: () => {
          const socket = new FakeSocket();
          sockets.push(socket);
          return socket;
        },
        previewStepMs: 1,
        animationStepMs: 1,
        voteDurationMs: 5000,
      });
      const apply = (action: object) => {
        const state = session.snapshot();
        const command = {
          ...action,
          sessionId: state.sessionId,
          expectedRevision: state.controlRevision,
        } as OperatorCommand;
        assert.ok(session.apply(command), `Rejected ${command.action}`);
        assert.equal(
          session.apply(command),
          undefined,
          'Repeated command accepted',
        );
      };
      const realStarted = performance.now();
      let commands = 0,
        polls = 0,
        sentVotes = 0,
        maxChoices = 0;
      let outcome = 'failed';
      try {
        apply({ action: 'twitch-connect' });
        await flush();
        context.mock.timers.tick(5000);
        await flush();
        sockets[0]!.receive(welcome());
        await flush();
        apply({ action: 'start', streamerColor });
        let lastReal = performance.now();
        while (session.snapshot().game.phase !== 'game-over') {
          sockets.at(-1)!.receive(packet('session_keepalive', {}));
          const state = session.snapshot();
          assert.ok(
            performance.now() - realStarted < 240000,
            'Real-time bound exceeded',
          );
          assert.ok(
            session.checkpoint().game.history.length < 240,
            'Turn bound exceeded without king capture',
          );
          assert.ok(
            state.storage.healthy,
            `Checkpoint failed in ${state.game.phase}`,
          );
          assert.notEqual(state.game.phase, 'paused', state.game.announcement);
          if (state.game.phase === 'streamer-roll') {
            apply({ action: 'roll' });
            commands++;
          } else if (state.game.phase === 'streamer-turn') {
            // A test driver chooses for the streamer; the application has no bot-control route.
            // The frozen original tree still owns legality after each micro-move.
            const best = DiceChess.getBestMove(state.game.dfen, {
              algorithm: 'greedy-v2',
            }).moves[0];
            const suggested = best
              ? `${best.from}${best.to}${best.promotion ?? ''}`
              : '';
            const legal = session.operatorState().legalActions;
            apply({
              action: 'move',
              uci: legal.includes(suggested) ? suggested : legal[0]!,
            });
            commands++;
          } else if (
            state.game.phase === 'preview' ||
            state.game.phase === 'chat-animation'
          ) {
            context.mock.timers.tick(1);
          } else if (state.game.phase === 'voting') {
            assert.equal(state.voting.phase, 'open');
            polls++;
            maxChoices = Math.max(maxChoices, state.game.choices.length);
            for (let user = 0; user < 3; user++) {
              const message = vote(
                Date.now(),
                (user % state.game.choices.length) + 1,
                String(200 + user),
              );
              sockets.at(-1)!.receive(voteFrame(message));
              sockets.at(-1)!.receive(voteFrame(message));
              sentVotes++;
            }
            context.mock.timers.tick(1);
            sockets
              .at(-1)!
              .receive(
                voteFrame(vote(Date.now(), state.game.choices.length, '200')),
              );
            sentVotes++;
            assert.equal(session.snapshot().voting.totalVoters, 3);
            context.mock.timers.tick(5000);
          } else {
            // Search still uses real workers/time. Advance their host watchdog by
            // real elapsed time rather than disabling the hard termination bound.
            const now = performance.now();
            const elapsed = Math.floor(now - lastReal);
            if (elapsed > 0) {
              context.mock.timers.tick(elapsed);
              lastReal += elapsed;
            }
          }
          if (
            !['streamer-preparing', 'chat-preparing'].includes(state.game.phase)
          )
            lastReal = performance.now();
          await flush();
        }
        const saved = parseCheckpoint(session.checkpoint());
        assert.equal(saved.game.phase, 'game-over');
        assert.ok(saved.game.winner);
        assert.equal(session.snapshot().storage.healthy, true);
        assert.deepEqual(
          parseCheckpoint(JSON.parse(readFileSync(stateFile, 'utf8'))),
          saved,
          'Final disk checkpoint differs from the completed game',
        );
        assert.ok(polls > 0, 'No actual fixture poll exercised');
        assert.ok(session.operatorState().canRematch);
        outcome = 'passed';
      } finally {
        const saved = session.checkpoint();
        try {
          writeFileSync(
            join(evidence, `${streamerColor}-report.json`),
            JSON.stringify(
              {
                fixtureOnly: true,
                outcome,
                startedAt,
                revision,
                trackedChanges,
                node: process.version,
                platform: process.platform,
                architecture: process.arch,
                streamerColor,
                diceSeed,
                acceleratedTimers: true,
                realPublicEngineWorkers: true,
                elapsedMs: Math.round(performance.now() - realStarted),
                turns: saved.game.history.length,
                polls,
                maxChoices,
                commands,
                sentVotes,
                phase: saved.game.phase,
                announcement: session.snapshot().game.announcement,
                storageHealthy: session.snapshot().storage.healthy,
                winner: saved.game.winner,
                finalDfen: saved.game.dfen,
              },
              null,
              2,
            ) + '\n',
          );
        } finally {
          session.dispose();
        }
      }
    },
  );
}
