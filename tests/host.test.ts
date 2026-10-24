import assert from 'node:assert/strict';
import { request } from 'node:http';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { startHost } from '../src/host/server.ts';
import type {
  OperatorBootstrap,
  PublicSnapshot,
} from '../src/shared/protocol.ts';

let host: Awaited<ReturnType<typeof startHost>>;
let capability: string;
const privateNote = 'PRIVATE_OPERATOR_TEST_SENTINEL';
before(async () => {
  host = await startHost({
    operatorPort: 0,
    obsPort: 0,
    clientDirectory: resolve('dist/client'),
    operatorNote: privateNote,
  });
  const response = await fetch(`${host.operatorUrl}/api/operator`, {
    headers: { 'X-Operator-Request': '1' },
  });
  const bootstrap = (await response.json()) as OperatorBootstrap;
  assert.equal(bootstrap.operatorNote, privateNote);
  capability = bootstrap.capability;
});
after(async () => {
  await host?.close();
});

async function snapshot(url = host.operatorUrl) {
  return (await (await fetch(`${url}/api/snapshot`)).json()) as PublicSnapshot;
}
function command(
  state: PublicSnapshot,
  message = 'Ready for a local rehearsal',
) {
  return {
    sessionId: state.sessionId,
    expectedRevision: state.revision,
    action: 'set-message',
    message,
  };
}
function send(
  body: unknown,
  options: { url?: string; origin?: string; authorization?: string } = {},
) {
  const url = options.url ?? host.operatorUrl;
  return fetch(`${url}/api/command`, {
    method: 'POST',
    headers: {
      Origin: options.origin ?? url,
      Authorization: options.authorization ?? `Bearer ${capability}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function stream(url: string) {
  const controller = new AbortController();
  const response = await fetch(`${url}/api/events`, {
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  let buffer = '';
  const decoder = new TextDecoder();
  return {
    close: () => controller.abort(),
    async next(): Promise<PublicSnapshot> {
      while (true) {
        const separator = buffer.indexOf('\n\n');
        if (separator >= 0) {
          const event = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          const data = event
            .split('\n')
            .find((line) => line.startsWith('data: '));
          if (data) return JSON.parse(data.slice(6)) as PublicSnapshot;
        } else {
          const { value, done } = await reader.read();
          if (done) throw new Error('Host stream ended');
          buffer += decoder.decode(value, { stream: true });
        }
      }
    },
  };
}

test(
  'both surfaces receive the same host-owned initial state and committed update',
  { timeout: 5000 },
  async () => {
    const operator = await stream(host.operatorUrl);
    const obs = await stream(host.obsUrl);
    try {
      const original = await operator.next();
      assert.deepEqual(await obs.next(), original);
      const response = await send(command(original));
      assert.equal(response.status, 200);
      const committed = (await response.json()) as PublicSnapshot;
      assert.equal(committed.revision, original.revision + 1);
      assert.equal(committed.game.phase, 'idle');
      assert.equal(committed.message, 'Ready for a local rehearsal');
      assert.deepEqual(await operator.next(), committed);
      assert.deepEqual(await obs.next(), committed);
      assert.deepEqual(await snapshot(host.obsUrl), committed);
      // A reconnect gets the latest state, rather than a client-generated default.
      const reconnected = await stream(host.obsUrl);
      try {
        assert.deepEqual(await reconnected.next(), committed);
      } finally {
        reconnected.close();
      }
    } finally {
      operator.close();
      obs.close();
    }
  },
);

test('OBS has no mutation or operator resources even with a valid operator capability', async () => {
  const original = await snapshot();
  assert.equal(
    (await send(command(original), { url: host.obsUrl })).status,
    405,
  );
  for (const path of [
    '/api/operator',
    '/operator.html',
    '/operator.js',
    '/api/command',
  ]) {
    assert.equal((await fetch(`${host.obsUrl}${path}`)).status, 404);
  }
  assert.deepEqual(await snapshot(), original);
});

test('operator rejects missing authority, cross-origin requests and DNS rebinding hosts', async () => {
  const original = await snapshot();
  assert.equal(
    (await send(command(original), { authorization: '' })).status,
    403,
  );
  assert.equal(
    (await send(command(original), { origin: host.obsUrl })).status,
    403,
  );
  assert.equal(
    (await send(command(original), { origin: 'https://example.invalid' }))
      .status,
    403,
  );
  assert.equal((await fetch(`${host.operatorUrl}/api/operator`)).status, 403);
  assert.equal(
    (
      await fetch(`${host.operatorUrl}/api/operator`, {
        headers: { Origin: host.obsUrl, 'X-Operator-Request': '1' },
      })
    ).status,
    403,
  );
  const rebound = await new Promise<number>((resolveStatus, reject) => {
    const req = request(
      `${host.operatorUrl}/api/snapshot`,
      { headers: { Host: 'attacker.invalid' } },
      (res) => {
        res.resume();
        resolveStatus(res.statusCode!);
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(rebound, 403);
  assert.deepEqual(await snapshot(), original);
});

test('stale, repeated and wrong-session commands cannot commit a second transition', async () => {
  const original = await snapshot();
  const body = command(original);
  assert.equal((await send(body)).status, 200);
  const committed = await snapshot();
  assert.equal((await send(body)).status, 409);
  assert.equal(
    (await send({ ...command(committed), sessionId: 'old-session' })).status,
    409,
  );
  assert.deepEqual(await snapshot(), committed);
});

test('invalid commands and oversized bodies do not change state or echo private data', async () => {
  const original = await snapshot();
  for (const body of [
    null,
    {},
    { ...command(original), action: 'resolve-choice' },
    command(original, ' '),
    command(original, 'x'.repeat(161)),
    { ...command(original), operatorNote: privateNote },
  ]) {
    const response = await send(body);
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes(privateNote));
  }
  assert.equal((await send(command(original, 'x'.repeat(5000)))).status, 413);
  assert.deepEqual(await snapshot(), original);
});

test('public snapshots and broadcast assets contain neither operator data nor capability', async () => {
  const state = await snapshot(host.obsUrl);
  assert.deepEqual(Object.keys(state).sort(), [
    'game',
    'integration',
    'message',
    'revision',
    'sessionId',
    'updatedAt',
  ]);
  assert.ok(!JSON.stringify(state).includes('legalActions'));
  assert.ok(!JSON.stringify(state).includes('analysis'));
  for (const path of ['/api/snapshot', '/', '/obs.js', '/styles.css']) {
    const response = await fetch(`${host.obsUrl}${path}`);
    const body = await response.text();
    assert.ok(!body.includes(privateNote));
    assert.ok(!body.includes(capability));
    assert.ok(!body.includes('/api/command'));
    assert.ok(!body.includes('/api/operator'));
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.ok(
      response.headers
        .get('content-security-policy')
        ?.includes("frame-ancestors 'none'"),
    );
  }
});
