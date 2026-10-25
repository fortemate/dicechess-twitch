import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Poll, selectLeader, timestampNs } from '../src/voting/poll.ts';
import { Session } from '../src/host/session.ts';
import { fixtures } from './candidate-fixtures.ts';
import {
  authFixture,
  clientId,
  FakeSocket,
  flush,
  packet,
  welcome,
} from './twitch-fixtures.ts';
import { twoCandidates, vote, voteFrame } from './voting-fixtures.ts';

test('one equal vote per user follows source chronology, ignoring duplicate and older delivery', () => {
  const poll = new Poll('round', [1, 2, 3], 1000, 30000);
  const first = vote(1010);
  assert.equal(poll.accept(first, 1010), true);
  assert.equal(poll.accept({ ...first, text: '!vote 3' }, 1010), false);
  assert.equal(
    poll.accept(
      { ...first, eventId: 'different-envelope', text: '!vote 2' },
      1010,
    ),
    false,
  );
  assert.equal(poll.accept(vote(1011, 2), 1012), true);
  assert.equal(poll.accept(vote(1010, 3), 1013), false);
  assert.equal(poll.accept(vote(1013, 1, '201'), 1013), true);
  assert.deepEqual(poll.counts(), [
    { option: 1, votes: 1 },
    { option: 2, votes: 1 },
    { option: 3, votes: 0 },
  ]);
  const decision = poll.close(31000, 123)!;
  assert.deepEqual(decision.leaders, [1, 2]);
  assert.equal(
    decision.winner,
    decision.leaders[selectLeader(decision.leaders, decision.seed)],
  );
  assert.equal(poll.close(31001, 456), undefined);
  assert.equal(poll.accept(vote(31001), 31001), false);
});

test('nanosecond window boundaries, strict commands, identities and late delivery are validated', () => {
  const start = Date.parse('2026-10-25T01:00:00Z');
  const poll = new Poll('round', [1, 2], start, 1000);
  const now = start + 999;
  for (const patch of [
    { sentAt: '2026-10-25T00:59:59.999999999Z' },
    { sentAt: '2026-10-25T01:00:01.000000000Z' },
    { sentAt: 'not-a-time' },
    { userId: '' },
    { messageId: '' },
    { text: '!vote 3' },
    { text: 'vote 1' },
    { text: '!vote 1 please' },
    { text: '!vote 01' },
    { receivedAtMs: start - 1 },
    { receivedAtMs: now + 1 },
  ])
    assert.equal(poll.accept(vote(now, 1, '200', patch), now), false);
  assert.equal(
    poll.accept(
      vote(now, 1, '200', { sentAt: '2026-10-25T01:00:00.999999999Z' }),
      now,
    ),
    true,
  );
  assert.equal(poll.accept(vote(now, 2, '201'), start + 1000), false);
  assert.equal(
    timestampNs('2026-10-25T03:00:00.123456789+02:00'),
    timestampNs('2026-10-25T01:00:00.123456789Z'),
  );
  assert.equal(
    timestampNs('2026-10-25T01:00:00.123456789Z')! % 1000000000n,
    123456789n,
  );
});

test('pause retains accepted votes and remaining duration; no votes waits for an explicit extension', () => {
  const poll = new Poll('round', [1, 2], 1000, 30000);
  poll.accept(vote(1100), 1100);
  assert.equal(poll.pause(2000), true);
  assert.equal(poll.remaining(90000), 29000);
  assert.equal(poll.accept(vote(3000, 2), 3000), false);
  assert.equal(poll.close(90000), undefined);
  assert.equal(poll.resume(90000), true);
  assert.equal(poll.accept(vote(89999, 2), 90001), false);
  assert.equal(poll.accept(vote(90001, 2), 90001), true);
  assert.equal(poll.close(118999), undefined);
  assert.equal(poll.close(119000, 9)?.winner, 2);
  const empty = new Poll('empty', [1, 2], 0, 100);
  assert.equal(empty.close(100), undefined);
  assert.equal(empty.phase, 'waiting');
  assert.equal(empty.accept(vote(101), 101), false);
  assert.equal(empty.extend(200, 100), true);
  assert.equal(empty.accept(vote(150), 201), false);
  assert.equal(empty.accept(vote(201), 201), true);
  assert.equal(empty.close(300, 7)?.winner, 1);
});

test('source-timestamp ties have deterministic message-id order and tie seeds select only leaders', () => {
  for (const order of [
    [1, 2],
    [2, 1],
  ]) {
    const poll = new Poll('round', [1, 2], 0, 100);
    for (const option of order)
      poll.accept(vote(1, option, '200', { messageId: String(option) }), 1);
    assert.equal(poll.close(100, 42)?.winner, 2);
  }
  const outcomes = new Set(
    Array.from({ length: 100 }, (_, seed) => selectLeader([1, 2, 3], seed)),
  );
  assert.deepEqual([...outcomes].sort(), [0, 1, 2]);
});

test('installed-chat fixture resolves exactly one full turn; loss invalidates votes and blocks silent resume', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const fixture = authFixture();
  const sockets: FakeSocket[] = [];
  const session = new Session({
    twitchClientId: clientId,
    twitchFetch: fixture.fetcher,
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
    animationStepMs: 1,
  });
  const keepalive = () =>
    sockets.at(-1)!.receive(packet('session_keepalive', {}));
  try {
    session.twitch.connect();
    await flush();
    context.mock.timers.tick(5000);
    await flush();
    sockets[0]!.receive(welcome());
    await flush();
    session.game.start('b');
    await flush();
    assert.equal(session.snapshot().game.phase, 'preview');
    assert.equal(session.voting.setDuration(10), false);
    sockets[0]!.receive(voteFrame(vote(Date.now())));
    assert.equal(session.snapshot().voting.totalVoters, 0);
    for (
      let step = 0;
      step < 30 && session.snapshot().voting.phase !== 'open';
      step++
    )
      context.mock.timers.tick(10);
    assert.equal(session.snapshot().voting.phase, 'open');
    const choices = session.snapshot().game.choices;
    const roundId = session.snapshot().game.roundId!;
    sockets[0]!.receive(voteFrame(vote(Date.now(), 1)));
    context.mock.timers.tick(1);
    sockets[0]!.receive(voteFrame(vote(Date.now(), 2)));
    assert.equal(session.snapshot().voting.totalVoters, 1);
    session.game.pause();
    context.mock.timers.tick(1000);
    keepalive();
    assert.equal(session.snapshot().voting.phase, 'paused');
    assert.equal(session.game.resume(), true);
    assert.equal(session.snapshot().voting.totalVoters, 1);
    sockets[0]!.drop();
    assert.equal(session.snapshot().game.phase, 'paused');
    assert.notEqual(session.snapshot().game.roundId, roundId);
    assert.equal(session.snapshot().voting.totalVoters, 0);
    assert.equal(session.game.resume(), false);
    context.mock.timers.tick(1000);
    sockets[1]!.receive(welcome('fresh'));
    await flush();
    assert.equal(session.snapshot().game.phase, 'paused');
    session.game.resume();
    for (
      let step = 0;
      step < 30 && session.snapshot().voting.phase !== 'open';
      step++
    )
      context.mock.timers.tick(10);
    assert.equal(session.snapshot().voting.phase, 'open');
    assert.deepEqual(session.snapshot().game.choices, choices);
    sockets[1]!.receive(voteFrame(vote(Date.now(), 2)));
    context.mock.timers.tick(5000);
    const decision = session.snapshot().voting.lastDecision!;
    assert.deepEqual(session.voteDecisions(), [decision]);
    assert.equal(decision.winner, 2);
    assert.equal(session.game.resolveChoice(decision.roundId, 2), false);
    for (let index = 0; index < choices[1]!.moves.length + 1; index++)
      context.mock.timers.tick(1);
    assert.equal(session.snapshot().game.phase, 'streamer-roll');
    assert.equal(session.snapshot().game.dfen, choices[1]!.resultingDfen);
    assert.equal(session.snapshot().game.lastTurn?.reason, 'chat-choice');
    assert.ok(!JSON.stringify(session.snapshot()).includes('userId'));
    assert.ok(!JSON.stringify(session.snapshot()).includes('messageId'));
  } finally {
    session.dispose();
  }
});
