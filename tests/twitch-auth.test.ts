import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TwitchAuth } from '../src/twitch/auth.ts';
import { TwitchConnection } from '../src/twitch/connection.ts';
import { Session } from '../src/host/session.ts';
import { enumerateTurns } from '../src/engine/search.ts';
import { fixtures } from './candidate-fixtures.ts';
import {
  clientId,
  fixtureTokens,
  authFixture,
  flush,
  FakeSocket,
  welcome,
  chat,
  packet,
} from './twitch-fixtures.ts';

test('device flow requests only read-chat, keeps credentials host-only and validates before connecting', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const fixture = authFixture({ pending: 1 });
  const users: string[] = [];
  const auth = new TwitchAuth({
    clientId,
    fetcher: fixture.fetcher,
    changed: () => {},
    authorized: (identity) => users.push(identity.userId),
  });
  try {
    assert.equal(auth.connect(), true);
    assert.equal(auth.connect(), false);
    await flush();
    assert.equal(auth.operatorState().activation?.userCode, 'ABCD-EFGH');
    assert.ok(
      !JSON.stringify(auth.operatorState()).includes(fixtureTokens.device),
    );
    context.mock.timers.tick(5000);
    await flush();
    assert.equal(auth.state().phase, 'authorizing');
    context.mock.timers.tick(5000);
    await flush();
    assert.deepEqual(users, ['100']);
    assert.equal(auth.state().phase, 'authorized');
    assert.equal(auth.operatorState().activation, null);
    assert.ok(!JSON.stringify(auth.state()).includes(fixtureTokens.access));
    const grant = fixture.calls.find((call) => call.url.endsWith('/device'))!;
    assert.equal(grant.form.get('scopes'), 'user:read:chat');
    await auth.subscribeChat('socket-session', new AbortController().signal);
    const subscription = fixture.calls.find((call) =>
      call.url.endsWith('/subscriptions'),
    )!;
    assert.deepEqual(subscription.body, {
      type: 'channel.chat.message',
      version: '1',
      condition: { broadcaster_user_id: '100', user_id: '100' },
      transport: { method: 'websocket', session_id: 'socket-session' },
    });
    assert.ok(fixture.calls.every((call) => !call.form.has('client_secret')));
  } finally {
    auth.disconnect();
  }
});

test('simultaneous 401s serialize refresh and retain rotated public-client credentials', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const fixture = authFixture();
  const auth = new TwitchAuth({
    clientId,
    fetcher: fixture.fetcher,
    changed: () => {},
    authorized: () => {},
  });
  try {
    auth.connect();
    await flush();
    context.mock.timers.tick(5000);
    await flush();
    fixture.invalidate();
    await Promise.all([
      auth.subscribeChat('one', new AbortController().signal),
      auth.subscribeChat('two', new AbortController().signal),
    ]);
    assert.equal(fixture.refreshCount(), 1);
    fixture.invalidate();
    await auth.subscribeChat('three', new AbortController().signal);
    assert.equal(fixture.refreshCount(), 2);
    const refreshes = fixture.calls.filter(
      (call) => call.form.get('grant_type') === 'refresh_token',
    );
    assert.equal(
      refreshes[0]!.form.get('refresh_token'),
      fixtureTokens.refresh,
    );
    assert.equal(
      refreshes[1]!.form.get('refresh_token'),
      'REFRESHED_REFRESH_1',
    );
  } finally {
    auth.disconnect();
  }
});

test('hourly validation failure clears authorization instead of silently keeping a session alive', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const fixture = authFixture({ denyRefresh: true });
  const auth = new TwitchAuth({
    clientId,
    fetcher: fixture.fetcher,
    changed: () => {},
    authorized: () => {},
  });
  try {
    auth.connect();
    await flush();
    context.mock.timers.tick(5000);
    await flush();
    fixture.invalidate();
    context.mock.timers.tick(3600000);
    await flush();
    assert.equal(auth.state().phase, 'revoked');
    assert.equal(auth.state().identity, null);
    assert.equal(auth.operatorState().activation, null);
    assert.ok(
      !JSON.stringify(auth.operatorState()).includes(fixtureTokens.refresh),
    );
  } finally {
    auth.disconnect();
  }
});

test('expired codes, insufficient scope and unsafe activation URLs fail without exposing provider text', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  for (const options of [
    { expiresIn: 5 },
    { wrongScope: true },
    {
      verificationUri: `https://attacker.invalid/activate?secret=${fixtureTokens.device}`,
    },
  ]) {
    const fixture = authFixture(options);
    const auth = new TwitchAuth({
      clientId,
      fetcher: fixture.fetcher,
      changed: () => {},
      authorized: () => assert.fail('Invalid grant became authorized'),
    });
    try {
      auth.connect();
      await flush();
      context.mock.timers.tick(5000);
      await flush();
      assert.ok(['revoked', 'error'].includes(auth.state().phase));
      assert.equal(auth.operatorState().activation, null);
      assert.ok(
        !JSON.stringify(auth.operatorState()).includes(fixtureTokens.device),
      );
    } finally {
      auth.disconnect();
    }
  }
});

test('connection health separates graceful handoff from loss and never projects authorization material', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const fixture = authFixture();
  const sockets: FakeSocket[] = [];
  let interruptions = 0;
  let restorations = 0;
  let messages = 0;
  const connection = new TwitchConnection({
    clientId,
    fetcher: fixture.fetcher,
    socket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    changed: () => {},
    interrupted: () => {
      interruptions++;
    },
    restored: () => {
      restorations++;
    },
    onChat: () => {
      messages++;
    },
  });
  try {
    connection.connect();
    await flush();
    const publicAuth = JSON.stringify(connection.snapshot());
    assert.ok(!publicAuth.includes('ABCD-EFGH'));
    assert.ok(!publicAuth.includes('verificationUri'));
    context.mock.timers.tick(5000);
    await flush();
    sockets[0]!.receive(welcome());
    await flush();
    assert.equal(connection.snapshot().healthy, true);
    assert.equal(restorations, 1);
    sockets[0]!.receive(chat());
    assert.equal(messages, 1);
    sockets[0]!.receive(
      packet('session_reconnect', {
        session: {
          reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?handoff=fixture',
        },
      }),
    );
    sockets[1]!.receive(welcome('handoff'));
    await flush();
    assert.equal(interruptions, 0);
    sockets[1]!.drop();
    assert.equal(interruptions, 1);
    assert.equal(connection.snapshot().healthy, false);
    context.mock.timers.tick(1000);
    sockets[2]!.receive(welcome('fresh'));
    await flush();
    assert.equal(restorations, 2);
    sockets[2]!.receive(
      packet('revocation', {
        subscription: {
          type: 'channel.chat.message',
          condition: { broadcaster_user_id: '100' },
          status: 'authorization_revoked',
        },
      }),
    );
    assert.equal(connection.snapshot().phase, 'revoked');
    assert.equal(interruptions, 2);
    for (const value of Object.values(fixtureTokens))
      assert.ok(!JSON.stringify(connection.snapshot()).includes(value));
  } finally {
    connection.dispose();
  }
});

test('installed chat feeds the session adapter and an interrupted poll cannot silently resume', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
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
    candidates: async (request) => {
      const legal = enumerateTurns(request.rolledDfen, 25000);
      const turns = legal.turns.slice(0, 2);
      return {
        request,
        status: 'ready',
        reason: 'complete',
        choices: turns.map((turn, index) => ({
          option: index + 1,
          moves: turn.moves,
          resultingDfen: turn.resultingDfen,
        })),
        analysis: {
          basis: 'engine-equity-v1',
          scored: turns.map((turn) => ({ ...turn, utility: 0.5 })),
          legalPaths: legal.paths,
          uniqueStates: legal.turns.length,
          elapsedMs: 0,
        },
      };
    },
  });
  const received: string[] = [];
  const unsubscribe = session.onChat((message) => {
    received.push(`${message.userId}:${message.messageId}:${message.sentAt}`);
  });
  try {
    session.twitch.connect();
    await flush();
    assert.equal(
      session.operatorTwitchState().activation?.userCode,
      'ABCD-EFGH',
    );
    assert.ok(!JSON.stringify(session.snapshot()).includes('ABCD-EFGH'));
    context.mock.timers.tick(5000);
    await flush();
    sockets[0]!.receive(welcome());
    await flush();
    session.game.start('b');
    await flush();
    const original = session.game.snapshot();
    assert.equal(original.phase, 'preview');
    session.game.openVoting(original.roundId!);
    sockets[0]!.receive(chat('adapter-message'));
    assert.deepEqual(received, [
      '200:adapter-message:2026-10-25T01:00:00.123456789Z',
    ]);
    sockets[0]!.drop();
    assert.equal(session.game.snapshot().phase, 'paused');
    assert.equal(session.game.resume(), false);
    assert.notEqual(session.game.snapshot().roundId, original.roundId);
    assert.deepEqual(session.game.snapshot().choices, original.choices);
    context.mock.timers.tick(1000);
    sockets[1]!.receive(welcome('new-socket'));
    await flush();
    assert.equal(session.game.snapshot().phase, 'paused');
    assert.equal(session.game.resume(), true);
    assert.equal(session.game.snapshot().phase, 'preview');
    assert.equal(session.game.resolveChoice(original.roundId!, 1), false);
    for (const value of Object.values(fixtureTokens)) {
      assert.ok(!JSON.stringify(session.snapshot()).includes(value));
      assert.ok(!JSON.stringify(session.operatorTwitchState()).includes(value));
    }
  } finally {
    unsubscribe();
    session.dispose();
  }
});
