import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { startHost } from '../../src/host/server.ts';
import { Session } from '../../src/host/session.ts';

test('web artwork loads under the real CSP and coordinates follow both board orientations', async ({
  browser,
}) => {
  for (const side of ['w', 'b'] as const) {
    const session = new Session();
    session.game.start(side);
    session.game.pause();
    const host = await startHost({
      operatorPort: 0,
      obsPort: 0,
      clientDirectory: resolve('dist/client'),
      session,
    });
    try {
      for (const viewport of [
        { width: 1920, height: 1080 },
        { width: 1280, height: 720 },
      ]) {
        const page = await browser.newPage({ viewport });
        try {
          await page.goto(host.obsUrl);
          await expect(page.locator('#board .piece-image')).toHaveCount(32);
          await expect
            .poll(() =>
              page
                .locator('#board .piece-image')
                .evaluateAll((images) =>
                  images.every(
                    (image) =>
                      image instanceof HTMLImageElement &&
                      image.complete &&
                      image.naturalWidth > 0,
                  ),
                ),
            )
            .toBe(true);
          const sources = await page
            .locator('#board .piece-image')
            .evaluateAll((images) =>
              images.map((image) => image.getAttribute('src')),
            );
          expect(new Set(sources).size).toBe(12);
          await expect(page.locator('#board .coordinate-file')).toHaveText(
            side === 'w'
              ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
              : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'],
          );
          await expect(page.locator('#board .coordinate-rank')).toHaveText(
            side === 'w'
              ? ['8', '7', '6', '5', '4', '3', '2', '1']
              : ['1', '2', '3', '4', '5', '6', '7', '8'],
          );
          await expect(page.locator('#board .square').first()).toHaveAttribute(
            'aria-label',
            side === 'w' ? 'a8 black rook' : 'h1 white rook',
          );
          await expect(page.getByRole('button')).toHaveCount(0);
          const colors = await page
            .locator('#board .square')
            .evaluateAll((cells) =>
              cells
                .slice(0, 2)
                .map((cell) => getComputedStyle(cell).backgroundColor),
            );
          expect(colors).toEqual(['rgb(240, 217, 181)', 'rgb(181, 136, 99)']);
          await page.screenshot({
            path: `test-results/artwork-${side}-${viewport.height}.png`,
          });
        } finally {
          await page.close();
        }
      }
    } finally {
      await host.close();
    }
  }
});
