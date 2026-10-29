import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EventSubClient,
  AuthorizationRequired,
} from '../src/twitch/eventsub.ts';
import type { TransportHealth } from '../src/twitch/eventsub.ts';
import type { ChatMessage } from '../src/twitch/types.ts';
import { decodeEventSub, validReconnectUrl } from '../src/twitch/protocol.ts';
import { FakeSocket, packet, chat, welcome, flush } from './twitch-fixtures.ts';

test('one welcome creates one subscription; normalized chat keeps stable identities and nanoseconds', async () => {
  const sockets: FakeSocket[] = [];
  const messages: ChatMessage[] = [];
  const sessions: string[] = [];
  const client = new EventSubClient({
    broadcasterId: '100',
    socket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    subscribe: async (id) => {
      sessions.push(id);
    },
    onChat: (message) => messages.push(message),
    onHealth: () => {},
  });
  try {
    assert.equal(client.start(), true);
    assert.equal(client.start(), false);
    sockets[0]!.receive(welcome());
    sockets[0]!.receive(welcome());
    await flush();
    assert.deepEqual(sessions, ['session-a']);
    const first = chat('message-one');
    sockets[0]!.receive(first);
    sockets[0]!.receive(first);
    sockets[0]!.receive(chat('message-one'));
    sockets[0]!.receive(chat('message-two'));
    sockets[0]!.receive(chat('wrong-channel', '200', '999'));
    assert.equal(messages.length, 2);
    assert.equal(messages[0]!.userId, '200');
    assert.equal(messages[0]!.messageId, 'message-one');
    assert.equal(messages[0]!.sentAt, '2026-10-25T01:00:00.123456789Z');
    assert.equal(messages[0]!.text, '!vote 2');
    assert.ok(Number.isFinite(messages[0]!.receivedAtMs));
    assert.notEqual(messages[0]!.eventId, messages[1]!.eventId);
  } finally {
    client.stop();
  }
});

test('graceful reconnect keeps old socket until welcome and never creates a second subscription', async () => {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const health: TransportHealth[] = [];
  const messages: ChatMessage[] = [];
  let subscriptions = 0;
  const client = new EventSubClient({
    broadcasterId: '100',
    socket: (url) => {
      urls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    subscribe: async () => {
      subscriptions++;
    },
    onChat: (message) => messages.push(message),
    onHealth: (state) => health.push(state),
  });
  try {
    client.start();
    sockets[0]!.receive(welcome());
    await flush();
    const reconnect = 'wss://eventsub.wss.twitch.tv/ws?reconnect=fixture';
    sockets[0]!.receive(
      packet('session_reconnect', { session: { reconnect_url: reconnect } }),
    );
    assert.equal(urls[1], reconnect);
    assert.equal(sockets[0]!.closed, false);
    sockets[0]!.receive(chat('during-handoff'));
    sockets[1]!.receive(welcome('session-b'));
    await flush();
    assert.equal(sockets[0]!.closed, true);
    assert.equal(subscriptions, 1);
    sockets[0]!.receive(chat('stale-source'));
    sockets[0]!.drop();
    sockets[1]!.receive(chat('during-handoff'));
    sockets[1]!.receive(chat('new-source'));
    assert.equal(messages.length, 2);
    assert.deepEqual(health.slice(1), [
      { phase: 'connected', healthy: true },
      { phase: 'reconnecting', healthy: true },
      { phase: 'connected', healthy: true },
    ]);
  } finally {
    client.stop();
  }
});

test('loss/keepalive timeout cause a fresh session subscription; stop cancels retry', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const sockets: FakeSocket[] = [];
  const health: TransportHealth[] = [];
  let subscriptions = 0;
  const client = new EventSubClient({
    broadcasterId: '100',
    socket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    subscribe: async () => {
      subscriptions++;
    },
    onChat: () => {},
    onHealth: (state) => health.push(state),
  });
  try {
    client.start();
    sockets[0]!.receive(welcome());
    await flush();
    context.mock.timers.tick(9000);
    sockets[0]!.receive(packet('session_keepalive', {}));
    context.mock.timers.tick(9000);
    assert.equal(sockets.length, 1);
    context.mock.timers.tick(3001);
    assert.deepEqual(health.at(-1), { phase: 'reconnecting', healthy: false });
    context.mock.timers.tick(1000);
    assert.equal(sockets.length, 2);
    sockets[1]!.receive(welcome('fresh'));
    await flush();
    assert.equal(subscriptions, 2);
    sockets[1]!.drop();
    client.stop();
    context.mock.timers.tick(60000);
    assert.equal(sockets.length, 2);
    assert.deepEqual(health.at(-1), { phase: 'offline', healthy: false });
  } finally {
    client.stop();
  }
});

test('slightly delayed keepalives remain healthy while real silence still reconnects', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const socket = new FakeSocket();
  const health: TransportHealth[] = [];
  const failures: string[] = [];
  const client = new EventSubClient({
    broadcasterId: '100',
    socket: () => socket,
    subscribe: async () => {},
    onChat: () => {},
    onHealth: (state) => health.push(state),
    diagnostic: (reason) => failures.push(reason),
  });
  try {
    client.start();
    socket.receive(welcome());
    await flush();
    for (let interval = 0; interval < 3; interval++) {
      context.mock.timers.tick(10050);
      assert.equal(socket.closed, false);
      assert.deepEqual(health.at(-1), { phase: 'connected', healthy: true });
      socket.receive(packet('session_keepalive', {}));
    }
    socket.receive(chat('resets-liveness'));
    context.mock.timers.tick(11999);
    assert.equal(socket.closed, false);
    context.mock.timers.tick(2);
    assert.equal(socket.closed, true);
    assert.deepEqual(failures, ['keepalive-timeout']);
    assert.deepEqual(health.at(-1), { phase: 'reconnecting', healthy: false });
  } finally {
    client.stop();
  }
});

test('keepalive jitter allowance remains bounded for long negotiated intervals', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const socket = new FakeSocket();
  const failures: string[] = [];
  const client = new EventSubClient({
    broadcasterId: '100',
    socket: () => socket,
    subscribe: async () => {},
    onChat: () => {},
    onHealth: () => {},
    diagnostic: (reason) => failures.push(reason),
  });
  try {
    client.start();
    socket.receive(
      packet('session_welcome', {
        session: { id: 'long', keepalive_timeout_seconds: 600 },
      }),
    );
    await flush();
    context.mock.timers.tick(604999);
    assert.equal(socket.closed, false);
    context.mock.timers.tick(1);
    assert.equal(socket.closed, true);
    assert.deepEqual(failures, ['keepalive-timeout']);
  } finally {
    client.stop();
  }
});

test('failure diagnostics distinguish transport paths without provider text or identifiers', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  for (const expected of [
    'socket-create-failed',
    'welcome-timeout',
    'socket-closed',
    'socket-error',
    'subscription-failed',
    'invalid-reconnect',
    'chat-handler-failed',
  ]) {
    const socket = new FakeSocket();
    const failures: string[] = [];
    const client = new EventSubClient({
      broadcasterId: '100',
      socket: () => {
        if (expected === 'socket-create-failed')
          throw new Error('fixture-private-detail');
        return socket;
      },
      subscribe: async () => {
        if (expected === 'subscription-failed')
          throw new Error('fixture-private-detail');
      },
      onChat: () => {
        throw new Error('fixture-private-detail');
      },
      onHealth: () => {},
      diagnostic: (reason) => failures.push(reason),
    });
    try {
      client.start();
      if (expected === 'welcome-timeout') context.mock.timers.tick(10001);
      else if (expected !== 'socket-create-failed') {
        socket.receive(welcome());
        await flush();
        if (expected === 'socket-closed') socket.drop();
        if (expected === 'socket-error') socket.error();
        if (expected === 'invalid-reconnect')
          socket.receive(
            packet('session_reconnect', {
              session: {
                reconnect_url: 'wss://attacker.invalid/private-fixture',
              },
            }),
          );
        if (expected === 'chat-handler-failed') socket.receive(chat());
      }
      assert.deepEqual(failures, [expected]);
    } finally {
      client.stop();
    }
  }
});

test('a failing diagnostic sink cannot prevent fail-closed recovery', async () => {
  const socket = new FakeSocket();
  const health: TransportHealth[] = [];
  const client = new EventSubClient({
    broadcasterId: '100',
    socket: () => socket,
    subscribe: async () => {},
    onChat: () => {},
    onHealth: (state) => health.push(state),
    diagnostic: () => {
      throw new Error('fixture-private-diagnostic-error');
    },
  });
  try {
    client.start();
    socket.receive(welcome());
    await flush();
    assert.doesNotThrow(() => socket.error());
    assert.deepEqual(health.at(-1), { phase: 'reconnecting', healthy: false });
    assert.equal(socket.closed, true);
  } finally {
    client.stop();
  }
});

test('revocation and authorization failures stop rather than duplicate subscriptions', async () => {
  for (const failure of ['revocation', 'http-auth'] as const) {
    const socket = new FakeSocket();
    const health: TransportHealth[] = [];
    const client = new EventSubClient({
      broadcasterId: '100',
      socket: () => socket,
      subscribe: async () => {
        if (failure === 'http-auth') throw new AuthorizationRequired();
      },
      onChat: () => {},
      onHealth: (state) => health.push(state),
    });
    try {
      client.start();
      socket.receive(welcome());
      await flush();
      if (failure === 'revocation')
        socket.receive(
          packet('revocation', {
            subscription: {
              type: 'channel.chat.message',
              condition: { broadcaster_user_id: '100' },
              status: 'authorization_revoked',
            },
          }),
        );
      assert.equal(socket.closed, true);
      assert.deepEqual(health.at(-1), { phase: 'revoked', healthy: false });
    } finally {
      client.stop();
    }
  }
});

test('malformed/foreign frames and untrusted reconnect destinations cannot become chat input', () => {
  for (const raw of [
    '{',
    'null',
    '{}',
    'x'.repeat(262145),
    chat('x', 'not-a-stable-id'),
    chat('x', '200', '999'),
  ])
    assert.equal(decodeEventSub(raw, '100', 123), undefined);
  assert.equal(
    validReconnectUrl('wss://eventsub.wss.twitch.tv/ws?fixture=1'),
    true,
  );
  for (const url of [
    'ws://eventsub.wss.twitch.tv/ws',
    'wss://attacker.invalid/ws',
    'wss://eventsub.wss.twitch.tv.attacker.invalid/ws',
    'wss://user@eventsub.wss.twitch.tv/ws',
    'wss://eventsub.wss.twitch.tv:8443/ws',
  ])
    assert.equal(validReconnectUrl(url), false);
});
