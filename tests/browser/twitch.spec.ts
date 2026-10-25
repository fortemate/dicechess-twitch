import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { startHost } from '../../src/host/server.ts';
import { Session } from '../../src/host/session.ts';
import {
  authFixture,
  clientId,
  fixtureTokens,
  FakeSocket,
  welcome,
  chat,
} from '../twitch-fixtures.ts';

test('device approval stays on the operator page while OBS receives sanitized chat health', async ({
  browser,
}) => {
  // Entire authorization and socket service are explicit fixtures; this is
  // browser isolation evidence, not an actual Twitch account/channel test.
  const fixture = authFixture();
  const sockets: FakeSocket[] = [];
  const host = await startHost({
    operatorPort: 0,
    obsPort: 0,
    clientDirectory: resolve('dist/client'),
    session: new Session({
      twitchClientId: clientId,
      twitchFetch: fixture.fetcher,
      twitchSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    }),
  });
  const operator = await browser.newPage();
  const obs = await browser.newPage();
  try {
    await operator.goto(host.operatorUrl);
    await obs.goto(host.obsUrl);
    await operator
      .getByRole('button', { name: 'Connect Twitch', exact: true })
      .click();
    await expect(operator.locator('#twitch-code')).toHaveText('ABCD-EFGH');
    await expect(
      operator.getByRole('link', {
        name: 'Authorize read-only chat on Twitch',
      }),
    ).toHaveAttribute(
      'href',
      'https://www.twitch.tv/activate?public=true&device-code=ABCD-EFGH',
    );
    await expect(obs.locator('#twitch-status')).toHaveText(
      'Twitch: authorizing',
    );
    expect(await obs.locator('body').innerText()).not.toContain('ABCD-EFGH');
    expect((await fetch(`${host.obsUrl}/api/operator/twitch`)).status).toBe(
      404,
    );
    await expect.poll(() => sockets.length, { timeout: 10000 }).toBe(1);
    sockets[0]!.receive(welcome());
    await expect(obs.locator('#twitch-status')).toHaveText('Twitch: connected');
    sockets[0]!.receive(chat('browser-event'));
    await expect(operator.locator('#twitch-description')).toContainText(
      '1 messages received',
    );
    const state = JSON.stringify(
      await (await fetch(`${host.obsUrl}/api/snapshot`)).json(),
    );
    for (const value of [
      'ABCD-EFGH',
      ...Object.values(fixtureTokens),
      '!vote 2',
    ])
      expect(state).not.toContain(value);
    await operator
      .getByRole('button', { name: 'Disconnect Twitch', exact: true })
      .click();
    await expect(obs.locator('#twitch-status')).toHaveText('Twitch: offline');
    await expect(operator.locator('#twitch-activation')).toBeHidden();
    expect(sockets[0]!.closed).toBe(true);
  } finally {
    await operator.close();
    await obs.close();
    await host.close();
  }
});
