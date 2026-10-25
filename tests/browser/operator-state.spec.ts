import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FileStore } from '../../src/host/file-store.ts';
import { Session } from '../../src/host/session.ts';
import { startHost } from '../../src/host/server.ts';

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
    expectedRevision: before.revision,
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
      expectedRevision: current.revision,
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
