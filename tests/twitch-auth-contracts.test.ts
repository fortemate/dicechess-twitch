import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TwitchAuth } from '../src/twitch/auth.ts';
import {
  authFixture,
  clientId,
  fixtureTokens,
  flush,
} from './twitch-fixtures.ts';

const device = {
  device_code: fixtureTokens.device,
  user_code: 'ABCD-EFGH',
  verification_uri: 'https://www.twitch.tv/activate?fixture=retained',
  expires_in: 1800,
  interval: 5,
};

const activationPrefix = 'https://twitch.tv:443/activate#';

const invalidFields: [string, unknown][] = [
  ['device_code', ''],
  ['device_code', 1],
  ['device_code', 'x'.repeat(4097)],
  ['user_code', ''],
  ['user_code', null],
  ['user_code', 'x'.repeat(33)],
  ['verification_uri', ''],
  ['verification_uri', false],
  ['verification_uri', 'x'.repeat(2049)],
  ['expires_in', '1800'],
  ['expires_in', 0],
  ['expires_in', -1],
  ['expires_in', 86401],
  ['interval', '5'],
  ['interval', 0],
  ['interval', 61],
  ['interval', 1.5],
];

for (const [index, [field, value]] of invalidFields.entries()) {
  test(`device authorization rejects invalid ${field} case ${index}`, async () => {
    let calls = 0;
    let changes = 0;
    const auth = new TwitchAuth({
      clientId,
      fetcher: async () => {
        calls++;
        return Response.json({ ...device, [field]: value });
      },
      changed: () => changes++,
      authorized: () => assert.fail('Invalid device grant authorized'),
    });
    try {
      assert.equal(auth.connect(), true);
      await flush();
      assert.deepEqual(auth.state(), { phase: 'error', identity: null });
      assert.deepEqual(auth.operatorState(), {
        canConnect: true,
        canDisconnect: false,
        activation: null,
      });
      assert.equal(calls, 1);
      assert.equal(changes, 2);
    } finally {
      auth.disconnect();
    }
  });
}

for (const uri of [
  'not a URL',
  'http://twitch.tv/activate',
  'https://twitch.tv.attacker.invalid/activate',
  'https://twitch.tv/activate/',
  'https://user@twitch.tv/activate',
  'https://user:password@twitch.tv/activate',
  'https://twitch.tv:444/activate',
]) {
  test(`device authorization rejects activation destination ${uri}`, async () => {
    const auth = new TwitchAuth({
      clientId,
      fetcher: async () => Response.json({ ...device, verification_uri: uri }),
      changed: () => {},
      authorized: () => assert.fail('Unsafe destination authorized'),
    });
    try {
      auth.connect();
      await flush();
      assert.deepEqual(auth.state(), { phase: 'error', identity: null });
      assert.equal(auth.operatorState().activation, null);
    } finally {
      auth.disconnect();
    }
  });
}

for (const [name, body] of [
  ['invalid JSON', '{'],
  ['array', '[]'],
  ['null', 'null'],
  ['primitive', '42'],
  ['oversized', ' '.repeat(65537)],
] as const) {
  test(`device authorization rejects ${name} response without projecting it`, async () => {
    const auth = new TwitchAuth({
      clientId,
      fetcher: async () => new Response(body),
      changed: () => {},
      authorized: () => assert.fail('Malformed body authorized'),
    });
    try {
      auth.connect();
      await flush();
      assert.deepEqual(auth.state(), { phase: 'error', identity: null });
      assert.equal(auth.operatorState().activation, null);
    } finally {
      auth.disconnect();
    }
  });
}

for (const [name, overrides] of [
  ['lower bounds', { expires_in: 0.5, interval: 1 }],
  [
    'upper bounds',
    {
      device_code: 'd'.repeat(4096),
      user_code: 'u'.repeat(32),
      verification_uri: `${activationPrefix}${'x'.repeat(2048 - activationPrefix.length)}`,
      expires_in: 86400,
      interval: 60,
    },
  ],
] as const) {
  test(`device authorization preserves accepted ${name}`, async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1234 });
    const body = { ...device, ...overrides };
    let calls = 0;
    let changes = 0;
    const auth = new TwitchAuth({
      clientId,
      fetcher: async () => {
        calls++;
        return Response.json(body);
      },
      changed: () => changes++,
      authorized: () =>
        assert.fail('Grant should still be awaiting its first poll'),
    });
    try {
      auth.connect();
      await flush();
      const uri = new URL(body.verification_uri);
      uri.searchParams.set('public', 'true');
      assert.deepEqual(auth.operatorState().activation, {
        userCode: body.user_code,
        verificationUri: uri.toString(),
        expiresAtMs: 1234 + body.expires_in * 1000,
      });
      assert.deepEqual(auth.state(), { phase: 'authorizing', identity: null });
      assert.equal(calls, 1);
      assert.equal(changes, 2);
    } finally {
      auth.disconnect();
    }
  });
}

test('polling waits for pending responses and applies slow-down before its next request', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const fixture = authFixture();
  const polledAt: number[] = [];
  const authorized: string[] = [];
  let changes = 0;
  const auth = new TwitchAuth({
    clientId,
    fetcher: async (input, init) => {
      if (String(input).endsWith('/oauth2/token')) {
        polledAt.push(Date.now());
        if (polledAt.length === 1)
          return Response.json(
            { message: 'authorization_pending' },
            { status: 400 },
          );
        if (polledAt.length === 2)
          return Response.json({ error: 'slow_down' }, { status: 400 });
      }
      return fixture.fetcher(input, init);
    },
    changed: () => changes++,
    authorized: (identity) => authorized.push(identity.userId),
  });
  try {
    auth.connect();
    await flush();
    context.mock.timers.tick(4999);
    await flush();
    assert.deepEqual(polledAt, []);
    context.mock.timers.tick(1);
    await flush();
    assert.deepEqual(polledAt, [5000]);
    context.mock.timers.tick(5000);
    await flush();
    assert.deepEqual(polledAt, [5000, 10000]);
    context.mock.timers.tick(9999);
    await flush();
    assert.deepEqual(polledAt, [5000, 10000]);
    context.mock.timers.tick(1);
    await flush();
    assert.deepEqual(polledAt, [5000, 10000, 20000]);
    assert.deepEqual(authorized, ['100']);
    assert.equal(changes, 3);
    assert.deepEqual(auth.state(), {
      phase: 'authorized',
      identity: { userId: '100', login: 'fixturechannel' },
    });
    assert.equal(auth.operatorState().activation, null);
  } finally {
    auth.disconnect();
  }
});

test('a disconnected pending device response cannot overwrite a new authorization attempt', async () => {
  let resolveOld!: (response: Response) => void;
  let requests = 0;
  let changes = 0;
  const auth = new TwitchAuth({
    clientId,
    fetcher: async () => {
      requests++;
      return requests === 1
        ? new Promise<Response>((resolve) => {
            resolveOld = resolve;
          })
        : Response.json({ ...device, user_code: 'NEW-CODE' });
    },
    changed: () => changes++,
    authorized: () => assert.fail('No token polling has occurred'),
  });
  try {
    auth.connect();
    auth.disconnect();
    auth.connect();
    await flush();
    const current = auth.operatorState();
    assert.equal(current.activation?.userCode, 'NEW-CODE');
    resolveOld(Response.json(device));
    await flush();
    assert.deepEqual(auth.operatorState(), current);
    assert.equal(auth.state().phase, 'authorizing');
    assert.equal(requests, 2);
    assert.equal(changes, 4);
  } finally {
    auth.disconnect();
  }
});

test('slow-down polling is capped at sixty seconds', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const polledAt: number[] = [];
  const auth = new TwitchAuth({
    clientId,
    fetcher: async (input) => {
      if (String(input).endsWith('/device'))
        return Response.json({ ...device, interval: 55 });
      polledAt.push(Date.now());
      return Response.json({ message: 'slow_down' }, { status: 400 });
    },
    changed: () => {},
    authorized: () => assert.fail('Slow-down response authorized'),
  });
  try {
    auth.connect();
    await flush();
    context.mock.timers.tick(55000);
    await flush();
    context.mock.timers.tick(60000);
    await flush();
    context.mock.timers.tick(60000);
    await flush();
    assert.deepEqual(polledAt, [55000, 115000, 175000]);
    assert.equal(auth.state().phase, 'authorizing');
  } finally {
    auth.disconnect();
  }
});

test('expiry reached during the poll delay prevents the provider request', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let calls = 0;
  const auth = new TwitchAuth({
    clientId,
    fetcher: async () => {
      calls++;
      return Response.json({ ...device, expires_in: 5 });
    },
    changed: () => {},
    authorized: () => assert.fail('Expired grant authorized'),
  });
  try {
    auth.connect();
    await flush();
    context.mock.timers.tick(5000);
    await flush();
    assert.equal(calls, 1);
    assert.deepEqual(auth.state(), { phase: 'revoked', identity: null });
    assert.equal(auth.operatorState().activation, null);
  } finally {
    auth.disconnect();
  }
});

test('a pending token request is not overlapped and cannot authorize after disconnect', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const fixture = authFixture();
  let resolveToken!: (response: Response) => void;
  let polls = 0;
  let changes = 0;
  const auth = new TwitchAuth({
    clientId,
    fetcher: async (input, init) => {
      if (String(input).endsWith('/token')) {
        polls++;
        return new Promise<Response>((resolve) => {
          resolveToken = resolve;
        });
      }
      return fixture.fetcher(input, init);
    },
    changed: () => changes++,
    authorized: () => assert.fail('Disconnected grant authorized'),
  });
  try {
    auth.connect();
    await flush();
    context.mock.timers.tick(5000);
    await flush();
    context.mock.timers.tick(120000);
    await flush();
    assert.equal(polls, 1);
    auth.disconnect();
    resolveToken(
      Response.json({
        access_token: fixtureTokens.access,
        refresh_token: fixtureTokens.refresh,
        scope: ['user:read:chat'],
      }),
    );
    await flush();
    assert.deepEqual(auth.state(), { phase: 'offline', identity: null });
    assert.equal(auth.operatorState().activation, null);
    assert.equal(changes, 3);
  } finally {
    auth.disconnect();
  }
});

test('the body size boundary accepts exactly 65536 characters', async () => {
  const encoded = JSON.stringify(device);
  const auth = new TwitchAuth({
    clientId,
    fetcher: async () => new Response(encoded.padEnd(65536, ' ')),
    changed: () => {},
    authorized: () => assert.fail('Polling has not occurred'),
  });
  try {
    auth.connect();
    await flush();
    assert.equal(auth.state().phase, 'authorizing');
    assert.equal(auth.operatorState().activation?.userCode, device.user_code);
  } finally {
    auth.disconnect();
  }
});
