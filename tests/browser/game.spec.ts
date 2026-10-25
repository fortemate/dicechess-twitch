import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { startHost } from '../../src/host/server.ts';
import { Session } from '../../src/host/session.ts';
import { fixtures } from '../candidate-fixtures.ts';

test('board input completes a real engine turn and freezes chat choices on both surfaces', async ({
  browser,
}) => {
  // Controlled dice are an explicit test fixture. Both rules and candidate
  // workers are the real pinned public engine, with no fake Twitch events.
  const host = await startHost({
    operatorPort: 0,
    obsPort: 0,
    clientDirectory: resolve('dist/client'),
    session: new Session({ roll: () => [1, 2, 5] }),
  });
  const operator = await browser.newPage();
  const obs = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  const errors: string[] = [];
  operator.on('pageerror', (error) => errors.push(error.message));
  obs.on('pageerror', (error) => errors.push(error.message));
  try {
    await operator.goto(host.operatorUrl);
    await obs.goto(host.obsUrl);
    await operator
      .getByRole('button', { name: 'Start game', exact: true })
      .click();
    await expect(obs.locator('#phase')).toHaveText('streamer roll');
    await operator
      .getByRole('button', { name: 'Roll dice', exact: true })
      .click();
    await expect(operator.locator('#phase')).toHaveText('streamer turn');
    for (const [from, to] of [
      ['b1 white knight', 'c3 empty'],
      ['e2 white pawn', 'e4 empty'],
      ['d1 white queen', 'e2 empty'],
    ]) {
      await operator.getByRole('button', { name: from!, exact: true }).click();
      await operator.getByRole('button', { name: to!, exact: true }).click();
    }
    await expect(obs.locator('#phase')).toHaveText('preview', {
      timeout: 15000,
    });
    await operator
      .getByRole('button', { name: 'Pause game', exact: true })
      .click();
    await expect(obs.locator('#phase')).toHaveText('paused');
    await expect(
      operator.getByRole('button', { name: 'Start game', exact: true }),
    ).toBeHidden();
    await expect(
      operator.getByRole('button', { name: 'Roll dice', exact: true }),
    ).toBeHidden();
    await expect(
      operator.getByRole('button', { name: 'Pause game', exact: true }),
    ).toBeHidden();
    await expect(
      operator.getByRole('button', { name: 'Resume game', exact: true }),
    ).toBeVisible();
    await expect(obs.locator('#choices .choice').first()).toBeVisible();
    await expect(obs.locator('#board [data-square="e2"]')).toHaveText('♕');
    await expect(obs.locator('#board [data-square="c3"]')).toHaveText('♘');
    await expect(obs.getByRole('button')).toHaveCount(0);
    const state = await (await fetch(`${host.obsUrl}/api/snapshot`)).json();
    expect(state.game.dfen).toBe(state.game.rolledDfen);
    expect(state.game.roundId).toBeTruthy();
    expect(JSON.stringify(state)).not.toContain('legalActions');
    expect(JSON.stringify(state)).not.toContain('utility');
    expect((await fetch(`${host.obsUrl}/api/operator/state`)).status).toBe(404);
    expect(
      (await fetch(`${host.obsUrl}/api/command`, { method: 'POST' })).status,
    ).toBe(405);
    const sizes = await obs.locator('#board .square').evaluateAll((cells) =>
      cells.map((cell) => {
        const box = cell.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    expect(
      Math.max(...sizes.map((size) => size.height)) -
        Math.min(...sizes.map((size) => size.height)),
    ).toBeLessThan(1);
    expect(Math.abs(sizes[0]!.width - sizes[0]!.height)).toBeLessThan(1);
    await obs.screenshot({ path: 'test-results/game-obs.png', fullPage: true });
    await operator.screenshot({
      path: 'test-results/game-operator.png',
      fullPage: true,
    });
    await operator
      .getByRole('button', { name: 'Resume game', exact: true })
      .click();
    await expect(obs.locator('#phase')).toHaveText('preview');
    expect(errors).toEqual([]);
  } finally {
    await operator.close();
    await obs.close();
    await host.close();
  }
});

test('the browser offers legal promotion pieces and performs castling through board input', async ({
  browser,
}) => {
  for (const fixture of ['promotion', 'castling'] as const) {
    const host = await startHost({
      operatorPort: 0,
      obsPort: 0,
      clientDirectory: resolve('dist/client'),
      session: new Session({
        initialDfen: fixtures[fixture].split(' ').slice(0, 6).join(' '),
        roll: () => (fixture === 'promotion' ? [1, 6, 6] : [4, 5, 6]),
      }),
    });
    const page = await browser.newPage();
    try {
      await page.goto(host.operatorUrl);
      await page
        .getByRole('button', { name: 'Start game', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Roll dice', exact: true })
        .click();
      await expect(page.locator('#phase')).toHaveText('streamer turn');
      if (fixture === 'promotion') {
        await page
          .getByRole('button', { name: 'a7 white pawn', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'a8 empty', exact: true })
          .click();
        await expect(page.locator('#promotions button')).toHaveCount(4);
        await page
          .getByRole('button', { name: 'Promote to N', exact: true })
          .click();
        await expect(
          page.getByRole('button', { name: 'a8 white knight', exact: true }),
        ).toBeVisible();
      } else {
        await page
          .getByRole('button', { name: 'e1 white king', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'g1 empty', exact: true })
          .click();
        await expect(
          page.getByRole('button', { name: 'f1 white rook', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'g1 white king', exact: true }),
        ).toBeVisible();
      }
    } finally {
      await page.close();
      await host.close();
    }
  }
});
