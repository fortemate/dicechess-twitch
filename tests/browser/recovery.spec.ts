import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startHost } from '../../src/host/server.ts';
import { Session } from '../../src/host/session.ts';
import { FileStore } from '../../src/host/file-store.ts';
import { MemoryStore } from '../recovery-fixtures.ts';

test('saving failure is visible on OBS and only the operator can retry and resume', async ({
  browser,
}) => {
  const store = new MemoryStore();
  const session = new Session({ store, roll: () => [1, 2, 5] });
  const host = await startHost({
    operatorPort: 0,
    obsPort: 0,
    clientDirectory: resolve('dist/client'),
    session,
  });
  const operator = await browser.newPage(),
    obs = await browser.newPage();
  try {
    await operator.goto(host.operatorUrl);
    await obs.goto(host.obsUrl);
    await operator
      .getByRole('button', { name: 'Start game', exact: true })
      .click();
    await expect(obs.locator('#phase')).toHaveText('streamer roll');
    store.fail = true; // Explicit disk-failure fixture; no production failure-injection route.
    await operator
      .getByRole('button', { name: 'Roll dice', exact: true })
      .click();
    await expect(obs.locator('#storage-status')).toContainText(
      'Saving failed.',
    );
    await expect(operator.locator('#storage-status')).toBeVisible();
    await expect(
      operator.getByRole('button', { name: 'Publish to scene' }),
    ).toBeDisabled();
    await expect(obs.locator('#phase')).toHaveText('paused');
    expect(session.snapshot().game.rolledDfen).toBeNull();
    await expect(obs.getByRole('button')).toHaveCount(0);
    store.fail = false;
    await operator
      .getByRole('button', { name: 'Retry save', exact: true })
      .click();
    await expect(obs.locator('#storage-status')).toBeHidden();
    await expect(obs.locator('#phase')).toHaveText('paused');
    await operator
      .getByRole('button', { name: 'Resume game', exact: true })
      .click();
    await expect(obs.locator('#phase')).toHaveText('streamer roll');
    expect(session.snapshot().game.rolledDfen).toBeNull();
  } finally {
    await operator.close();
    await obs.close();
    await host.close();
  }
});

test('disk restart restores a partial turn; OBS reconnects and old operator authority is rejected', async ({
  browser,
}) => {
  const directory = mkdtempSync(join(tmpdir(), 'dicechess-browser-recovery-'));
  const file = join(directory, 'session.json');
  let session = new Session({
    store: new FileStore(file),
    roll: () => [1, 2, 5],
  });
  let host = await startHost({
    operatorPort: 0,
    obsPort: 0,
    clientDirectory: resolve('dist/client'),
    session,
  });
  const operator = await browser.newPage(),
    obs = await browser.newPage();
  try {
    await operator.goto(host.operatorUrl);
    await obs.goto(host.obsUrl);
    await operator
      .getByRole('button', { name: 'Start game', exact: true })
      .click();
    await operator
      .getByRole('button', { name: 'Roll dice', exact: true })
      .click();
    await expect(operator.locator('#phase')).toHaveText('streamer turn');
    await operator
      .getByRole('button', { name: 'b1 white knight', exact: true })
      .click();
    await operator
      .getByRole('button', { name: 'c3 empty', exact: true })
      .click();
    const before = session.snapshot();
    const old = (await (
      await fetch(`${host.operatorUrl}/api/operator`, {
        headers: { 'X-Operator-Request': '1' },
      })
    ).json()) as { capability: string };
    const operatorPort = Number(new URL(host.operatorUrl).port),
      obsPort = Number(new URL(host.obsUrl).port);
    await host.close();
    let rolls = 0;
    session = new Session({
      store: new FileStore(file),
      roll: () => {
        rolls++;
        return [1, 2, 5];
      },
    });
    host = await startHost({
      operatorPort,
      obsPort,
      clientDirectory: resolve('dist/client'),
      session,
    });
    await expect(obs.locator('#phase')).toHaveText('paused');
    await expect(obs.locator('#session')).not.toHaveText(before.sessionId);
    await expect(obs.locator('#board')).toHaveAttribute(
      'data-dfen',
      before.game.dfen,
    );
    await expect(operator.locator('#feedback')).toContainText(
      'Host restarted.',
    );
    const denied = await fetch(`${host.operatorUrl}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: host.operatorUrl,
        Authorization: `Bearer ${old.capability}`,
      },
      body: JSON.stringify({
        action: 'resume',
        sessionId: before.sessionId,
        expectedRevision: before.revision,
      }),
    });
    expect(denied.status).toBe(403);
    await operator.reload();
    await operator
      .getByRole('button', { name: 'Resume game', exact: true })
      .click();
    await expect(operator.locator('#phase')).toHaveText('streamer turn');
    expect(rolls).toBe(0);
    expect(session.snapshot().game.rolledDfen).toBe(before.game.rolledDfen);
    await operator
      .getByRole('button', { name: 'e2 white pawn', exact: true })
      .click();
    await operator
      .getByRole('button', { name: 'e4 empty', exact: true })
      .click();
    expect(session.checkpoint().game.moves).toEqual(['b1c3', 'e2e4']);
    expect(rolls).toBe(0);
    expect(session.snapshot().storage).toEqual({
      enabled: true,
      healthy: true,
      restored: true,
    });
  } finally {
    await operator.close();
    await obs.close();
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
