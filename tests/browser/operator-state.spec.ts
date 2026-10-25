import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FileStore } from '../../src/host/file-store.ts';
import { Session } from '../../src/host/session.ts';
import { startHost } from '../../src/host/server.ts';
import {
  authFixture,
  chat,
  clientId,
  FakeSocket,
  flush,
  welcome,
} from '../twitch-fixtures.ts';

test('Pause and Resume remain usable when chat arrives after the browser sends a command', async ({
  page,
}) => {
  const sockets: FakeSocket[] = [];
  const session = new Session({
    twitchClientId: clientId,
    twitchFetch: authFixture().fetcher,
    twitchSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  const host = await startHost({
    operatorPort: 0,
    obsPort: 0,
    clientDirectory: resolve('dist/client'),
    session,
  });
  let traffic: ReturnType<typeof setInterval> | undefined;
  try {
    session.twitch.connect();
    await expect.poll(() => sockets.length, { timeout: 10000 }).toBe(1);
    sockets[0]!.receive(welcome());
    await flush();
    session.game.start('w');
    await page.goto(host.operatorUrl);
    let delivered = 0;
    // Deterministically exercise the read/send gap without relying on load timing.
    // Twitch authorization/socket traffic is fixture-only; HTTP/UI are real.
    await page.route('**/api/command', async (route) => {
      sockets[0]!.receive(chat(`control-gap-${delivered++}`));
      await route.continue();
    });
    let background = 0;
    traffic = setInterval(
      () => sockets[0]!.receive(chat(`control-background-${background++}`)),
      20,
    );
    for (const [button, phase] of [
      ['Pause game', 'paused'],
      ['Resume game', 'streamer roll'],
      ['Pause game', 'paused'],
    ] as const) {
      const reply = page.waitForResponse((response) =>
        response.url().endsWith('/api/command'),
      );
      await page.getByRole('button', { name: button, exact: true }).click();
      expect((await reply).status()).toBe(200);
      await expect(page.locator('#phase')).toHaveText(phase);
    }
    expect(delivered).toBe(3);
    expect(background).toBeGreaterThan(0);
    expect(session.snapshot().twitch.receivedMessages).toBe(
      delivered + background,
    );
  } finally {
    clearInterval(traffic);
    await host.close();
  }
});

test('restored form values match the host and unrelated snapshots preserve unpublished drafts', async ({
  page,
}) => {
  const directory = mkdtempSync(join(tmpdir(), 'dicechess-operator-state-'));
  const file = join(directory, 'session.json');
  const source = new Session({ store: new FileStore(file) });
  source.voting.setDuration(45);
  const before = source.snapshot();
  source.apply({
    action: 'set-message',
    sessionId: before.sessionId,
    expectedRevision: before.controlRevision,
    message: 'Saved operator message',
  });
  source.dispose();
  const session = new Session({ store: new FileStore(file) });
  const host = await startHost({
    operatorPort: 0,
    obsPort: 0,
    clientDirectory: resolve('dist/client'),
    session,
  });
  try {
    await page.goto(host.operatorUrl);
    await expect(page.locator('#message-input')).toHaveValue(
      'Saved operator message',
    );
    await expect(page.locator('#vote-seconds')).toHaveValue('45');
    await page.locator('#message-input').fill('Unpublished operator draft');
    await page.locator('#vote-seconds').fill('60');
    session.game.start('w');
    await expect(page.locator('#phase')).toHaveText('streamer roll');
    await expect(page.locator('#message-input')).toHaveValue(
      'Unpublished operator draft',
    );
    await expect(page.locator('#vote-seconds')).toHaveValue('60');
    await page.reload();
    await expect(page.locator('#message-input')).toHaveValue(
      'Saved operator message',
    );
    await expect(page.locator('#vote-seconds')).toHaveValue('45');
    const current = session.snapshot();
    session.apply({
      action: 'set-message',
      sessionId: current.sessionId,
      expectedRevision: current.controlRevision,
      message: 'New authoritative message',
    });
    session.voting.setDuration(50);
    await expect(page.locator('#message-input')).toHaveValue(
      'New authoritative message',
    );
    await expect(page.locator('#vote-seconds')).toHaveValue('50');
  } finally {
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
