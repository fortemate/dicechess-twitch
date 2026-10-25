import { test, expect } from '@playwright/test';
import { createServer, request } from 'node:http';
import type { ServerResponse } from 'node:http';

test('operator publication updates the read-only scene through the host', async ({
  browser,
}) => {
  const operator = await browser.newPage();
  const obs = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  const errors: string[] = [];
  operator.on('pageerror', (error) => errors.push(error.message));
  obs.on('pageerror', (error) => errors.push(error.message));
  await operator.goto('http://127.0.0.1:4310');
  await obs.goto('http://127.0.0.1:4311');
  await expect(
    operator.getByRole('button', { name: 'Publish to scene' }),
  ).toBeEnabled();
  await expect(obs.locator('#connection')).toHaveText('Live from local host');
  await expect(obs.locator('#session')).toHaveText(
    await operator.locator('#session').innerText(),
  );
  const originalRevision = Number(await obs.locator('#revision').innerText());
  await operator.getByLabel('On-air message').fill('The chat takes a seat');
  await operator.getByLabel('Scene status').selectOption('paused');
  await operator.getByRole('button', { name: 'Publish to scene' }).click();
  await expect(operator.locator('#feedback')).toHaveText('Published by host');
  await expect(obs.locator('#message')).toHaveText('The chat takes a seat');
  await expect(obs.locator('#phase')).toHaveText('Paused');
  await expect(obs.locator('#revision')).toHaveText(
    String(originalRevision + 1),
  );
  await expect(obs.locator('#revision')).toHaveText(
    await operator.locator('#revision').innerText(),
  );
  await expect(obs.getByRole('button')).toHaveCount(0);
  await expect(obs.locator('input, select, form')).toHaveCount(0);
  // Real browser enforcement: an OBS document cannot read operator authority.
  expect(
    await obs.evaluate(async () => {
      try {
        await fetch('http://127.0.0.1:4310/api/operator', {
          headers: { 'X-Operator-Request': '1' },
        });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await obs.reload();
  await expect(obs.locator('#message')).toHaveText('The chat takes a seat');
  expect(
    await obs.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    })),
  ).toEqual({ width: 1920, height: 1080 });
  await obs.screenshot({ path: 'test-results/obs-scene.png', fullPage: true });
  await operator.screenshot({
    path: 'test-results/operator.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await operator.close();
  await obs.close();
});

test('stream loss disables controls; reconnecting the same revision restores them', async ({
  page,
}) => {
  // A small GET-only transport bridge allows a real SSE connection to be severed
  // without changing the authoritative host session or revision.
  const streams = new Set<ServerResponse>();
  let acceptingStreams = true;
  const bridge = createServer((incoming, outgoing) => {
    if (incoming.url === '/api/events' && !acceptingStreams) {
      outgoing.writeHead(503);
      outgoing.end();
      return;
    }
    const upstream = request(
      `http://127.0.0.1:4310${incoming.url}`,
      {
        headers:
          incoming.headers['x-operator-request'] === '1'
            ? { 'X-Operator-Request': '1' }
            : {},
      },
      (response) => {
        outgoing.writeHead(response.statusCode!, response.headers);
        if (incoming.url === '/api/events') streams.add(outgoing);
        response.pipe(outgoing);
      },
    );
    outgoing.on('close', () => {
      streams.delete(outgoing);
      upstream.destroy();
    });
    upstream.on('error', () => {
      if (!outgoing.destroyed) outgoing.end();
    });
    upstream.end();
  });
  await new Promise<void>((resolve) => bridge.listen(0, '127.0.0.1', resolve));
  const address = bridge.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing bridge address');
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    const publish = page.getByRole('button', { name: 'Publish to scene' });
    await expect(publish).toBeEnabled();
    const revision = await page.locator('#revision').innerText();
    acceptingStreams = false;
    for (const response of streams) response.destroy();
    await expect(page.locator('#connection')).toHaveText(
      'Host disconnected · waiting to reconnect',
    );
    await expect(publish).toBeDisabled();
    acceptingStreams = true;
    await expect(page.locator('#connection')).toHaveText(
      'Live from local host',
    );
    await expect(publish).toBeEnabled();
    await expect(page.locator('#revision')).toHaveText(revision);
  } finally {
    await page.close();
    bridge.closeAllConnections();
    await new Promise<void>((resolve) => bridge.close(() => resolve()));
  }
});
