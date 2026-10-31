import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { startHost } from '../../src/host/server.ts';
import { Session } from '../../src/host/session.ts';
import { threeCandidates } from '../voting-fixtures.ts';

for (const scenario of [
  { name: 'opening', initialDfen: undefined, roll: [1, 2, 5] },
  {
    name: 'promotions',
    initialDfen: '4k3/PPP5/8/8/8/8/8/4K3 w - - 0 1',
    roll: [1, 1, 1],
  },
]) {
  test(`three ${scenario.name} choices fit 1080p and a smaller player`, async ({
    browser,
  }) => {
    // Engine-approved legal alternatives with controlled dice, no real Twitch/OBS claim.
    const session = new Session({
      roll: () => scenario.roll,
      ...(scenario.initialDfen ? { initialDfen: scenario.initialDfen } : {}),
      candidates: threeCandidates,
      previewStepMs: 20,
    });
    const host = await startHost({
      operatorPort: 0,
      obsPort: 0,
      clientDirectory: resolve('dist/client'),
      session,
    });
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    try {
      session.game.start('b');
      await page.goto(host.obsUrl);
      await expect
        .poll(() => session.snapshot().preview.phase)
        .toBe('complete');
      const state = session.snapshot();
      expect(state.game.choices).toHaveLength(3);
      expect(state.game.dfen).toBe(state.game.rolledDfen);
      await expect(page.locator('#preview-caption')).toContainText(
        'Original position restored',
      );
      await expect(page.locator('#board')).toHaveAttribute(
        'data-dfen',
        state.game.rolledDfen!,
      );
      await expect(page.locator('.mini-board')).toHaveCount(3);
      for (const [index, choice] of state.game.choices.entries()) {
        await expect(page.locator('.mini-board').nth(index)).toHaveAttribute(
          'data-dfen',
          choice.resultingDfen,
        );
        await expect(page.locator('.choice').nth(index)).toContainText(
          `!vote ${choice.option}`,
        );
        expect(
          await page
            .locator('.choice .move-summary')
            .nth(index)
            .locator('li')
            .count(),
        ).toBe(choice.moves.length);
      }
      await expect(page.getByRole('button')).toHaveCount(0);
      expect(JSON.stringify(state.preview)).not.toMatch(
        /utility|best.choice|score/i,
      );
      for (const [width, height] of [
        [1920, 1080],
        [1280, 720],
      ] as const) {
        await page.setViewportSize({ width, height });
        const boxes = await page
          .locator(
            '#board, .choice, #vote-status, #connection, .broadcast-footer',
          )
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const box = node.getBoundingClientRect();
              return {
                left: box.left,
                top: box.top,
                right: box.right,
                bottom: box.bottom,
              };
            }),
          );
        const footer = await page.locator('.broadcast-footer').boundingBox();
        for (const box of boxes.slice(0, -1))
          expect(box.bottom).toBeLessThanOrEqual(footer!.y - 4);
        for (const box of boxes) {
          expect(box.left).toBeGreaterThanOrEqual(0);
          expect(box.top).toBeGreaterThanOrEqual(0);
          expect(box.right).toBeLessThanOrEqual(width);
          expect(box.bottom).toBeLessThanOrEqual(height);
        }
        expect(
          await page.locator('body').evaluate((body) => body.scrollWidth),
        ).toBeLessThanOrEqual(width);
        expect(
          await page.locator('body').evaluate((body) => body.scrollHeight),
        ).toBeLessThanOrEqual(height);
        await page.screenshot({
          path: `test-results/choices-${scenario.name}-${width}.png`,
          fullPage: true,
        });
      }
    } finally {
      await page.close();
      await host.close();
    }
  });
}

test('browser displays a host preview frame without changing the game and rejoins that frame after reload', async ({
  browser,
}) => {
  const session = new Session({
    roll: () => [1, 2, 5],
    candidates: threeCandidates,
    previewStepMs: 200,
  });
  const host = await startHost({
    operatorPort: 0,
    obsPort: 0,
    clientDirectory: resolve('dist/client'),
    session,
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  try {
    await page.goto(host.obsUrl);
    session.game.start('b');
    await expect.poll(() => session.snapshot().preview.step > 0).toBe(true);
    session.game.pause();
    const frozen = session.snapshot();
    expect(frozen.preview.dfen).not.toBe(frozen.game.dfen);
    expect(frozen.game.dfen).toBe(frozen.game.rolledDfen);
    await expect(page.locator('#preview-caption')).toContainText(
      'Preview only',
    );
    await expect(page.locator('#board')).toHaveAttribute(
      'data-dfen',
      frozen.preview.dfen!,
    );
    await expect(page.locator('#board .trace')).toHaveCount(2);
    await expect(page.locator('.choice.previewing .choice-state')).toHaveText(
      'Preview',
    );
    await page.reload();
    await expect(page.locator('#phase')).toHaveText('paused');
    await expect(page.locator('#board')).toHaveAttribute(
      'data-dfen',
      frozen.preview.dfen!,
    );
    await expect(page.locator('.choice.previewing .choice-state')).toHaveText(
      'Preview',
    );
    expect(session.snapshot().preview).toEqual(frozen.preview);
    session.game.resume();
    await expect
      .poll(() => session.snapshot().preview.phase, { timeout: 10000 })
      .toBe('complete');
    await expect(page.locator('#board')).toHaveAttribute(
      'data-dfen',
      frozen.game.rolledDfen!,
    );
    await expect(page.locator('.choice.previewing, .choice-state')).toHaveCount(
      0,
    );
    expect(session.snapshot().game.positionVersion).toBe(
      frozen.game.positionVersion,
    );
    expect(session.snapshot().game.choices).toEqual(frozen.game.choices);
  } finally {
    await page.close();
    await host.close();
  }
});
