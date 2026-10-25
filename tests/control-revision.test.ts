import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Session } from '../src/host/session.ts';
import type { OperatorCommand } from '../src/shared/protocol.ts';
import { fixtures } from './candidate-fixtures.ts';
import {
  authFixture,
  clientId,
  FakeSocket,
  flush,
  welcome,
} from './twitch-fixtures.ts';
import { twoCandidates, vote, voteFrame } from './voting-fixtures.ts';

function identity(session: Session) {
  const state = session.snapshot();
  return {
    sessionId: state.sessionId,
    expectedRevision: state.controlRevision,
  };
}

test('every accepted command, including unchanged settings, consumes its control revision', () => {
  const session = new Session();
  try {
    for (const action of [
      { action: 'set-message', message: session.snapshot().message },
      { action: 'set-vote-duration', seconds: 30 },
    ] as const) {
      const command: OperatorCommand = { ...identity(session), ...action };
      const before = session.snapshot();
      assert.ok(session.apply(command));
      assert.equal(
        session.snapshot().controlRevision,
        before.controlRevision + 1,
      );
      assert.equal(session.apply(command), undefined);
    }
    const before = session.snapshot();
    assert.equal(
      session.apply({ ...identity(session), action: 'roll' }),
      undefined,
    );
    assert.deepEqual(session.snapshot(), before);
  } finally {
    session.dispose();
  }
});

test('chat counters, votes and countdowns preserve control validity; game, poll and connection transitions invalidate it', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const sockets: FakeSocket[] = [];
  const session = new Session({
    twitchClientId: clientId,
    twitchFetch: authFixture().fetcher,
    twitchSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    initialDfen: fixtures.two.split(' ').slice(0, 6).join(' '),
    roll: () => [1, 1, 1],
    candidates: twoCandidates,
    previewStepMs: 10,
    voteDurationMs: 5000,
  });
  const apply = (action: OperatorCommand['action']) =>
    session.apply({ ...identity(session), action } as OperatorCommand);
  try {
    assert.ok(apply('twitch-connect'));
    const authorizing = session.snapshot();
    const privateBefore = session.operatorTwitchState();
    await flush();
    assert.equal(
      session.snapshot().controlRevision,
      authorizing.controlRevision,
    );
    assert.ok(session.snapshot().revision > authorizing.revision);
    assert.ok(session.operatorTwitchState().revision > privateBefore.revision);
    assert.ok(session.operatorTwitchState().activation);
    context.mock.timers.tick(5000);
    await flush();
    sockets[0]!.receive(welcome());
    await flush();
    const connected = identity(session);
    assert.ok(
      session.apply({ ...connected, action: 'start', streamerColor: 'b' }),
    );
    assert.equal(session.apply({ ...connected, action: 'pause' }), undefined);
    await flush();
    // Preview frame changes also leave the current Pause command valid.
    const preview = session.snapshot();
    context.mock.timers.tick(10);
    assert.ok(session.snapshot().revision > preview.revision);
    assert.equal(session.snapshot().controlRevision, preview.controlRevision);
    for (
      let step = 0;
      step < 30 && session.snapshot().voting.phase !== 'open';
      step++
    )
      context.mock.timers.tick(10);
    assert.equal(session.snapshot().voting.phase, 'open');
    const opened = session.snapshot();
    const pause: OperatorCommand = { ...identity(session), action: 'pause' };
    sockets[0]!.receive(voteFrame(vote(Date.now(), 1)));
    context.mock.timers.tick(1000);
    assert.ok(session.snapshot().revision > opened.revision);
    assert.equal(session.snapshot().controlRevision, opened.controlRevision);
    assert.equal(session.snapshot().voting.totalVoters, 1);
    assert.ok(
      session.snapshot().voting.remainingMs < opened.voting.remainingMs,
    );
    assert.equal(session.operatorState().revision, opened.controlRevision);
    assert.ok(session.apply(pause));
    assert.equal(session.apply(pause), undefined);
    assert.ok(apply('resume'));
    const beforeLoss = identity(session);
    sockets[0]!.drop();
    assert.ok(session.snapshot().controlRevision > beforeLoss.expectedRevision);
    assert.equal(session.apply({ ...beforeLoss, action: 'resume' }), undefined);
    context.mock.timers.tick(1000);
    sockets[1]!.receive(welcome('fresh'));
    await flush();
    assert.ok(apply('resume'));
    for (
      let step = 0;
      step < 30 && session.snapshot().voting.phase !== 'open';
      step++
    )
      context.mock.timers.tick(10);
    assert.equal(session.snapshot().voting.totalVoters, 0);
    const beforeDeadline = identity(session);
    context.mock.timers.tick(5000);
    assert.equal(session.snapshot().voting.phase, 'waiting');
    assert.ok(
      session.snapshot().controlRevision > beforeDeadline.expectedRevision,
    );
    assert.equal(
      session.apply({ ...beforeDeadline, action: 'extend-vote' }),
      undefined,
    );
    const extension: OperatorCommand = {
      ...identity(session),
      action: 'extend-vote',
    };
    assert.ok(session.apply(extension));
    assert.equal(session.apply(extension), undefined);
    assert.equal(session.snapshot().voting.phase, 'open');
  } finally {
    session.dispose();
  }
});
