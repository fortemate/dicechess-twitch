import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { startHost } from '../../src/host/server.ts';
import { Session } from '../../src/host/session.ts';
import { fixtures } from '../candidate-fixtures.ts';
import {
  authFixture,
  clientId,
  FakeSocket,
  packet,
  welcome,
} from '../twitch-fixtures.ts';
import { twoCandidates, vote, voteFrame } from '../voting-fixtures.ts';

test('empty voting stays visible; operator extension accepts equal chat votes and executes once on both pages', async ({
  browser,
}) => {
  // Fake Twitch services, real host/engine/browser. This is not live-channel evidence.
  const fixture = authFixture();
  const sockets: FakeSocket[] = [];
  const session = new Session({
    twitchClientId: clientId,
    twitchFetch: fixture.fetcher,
    twitchSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    initialDfen: fixtures.two.split(' ').slice(0, 6).join(' '),
    roll: () => [1, 1, 1],
    candidates: twoCandidates,
    previewMs: 50,
    animationStepMs: 20,
  });
  const host = await startHost({
    operatorPort: 0,
    obsPort: 0,
    clientDirectory: resolve('dist/client'),
    session,
  });
  const keepalive = setInterval(
    () => sockets.at(-1)?.receive(packet('session_keepalive', {})),
    2000,
  );
  const operator = await browser.newPage();
  const obs = await browser.newPage();
  try {
    await operator.goto(host.operatorUrl);
    await obs.goto(host.obsUrl);
    await operator
      .getByRole('button', { name: 'Connect Twitch', exact: true })
      .click();
    await expect.poll(() => sockets.length, { timeout: 10000 }).toBe(1);
    sockets[0]!.receive(welcome());
    await expect(obs.locator('#twitch-status')).toHaveText('Twitch: connected');
    await operator.locator('#vote-seconds').fill('5');
    await operator
      .getByRole('button', { name: 'Set vote duration', exact: true })
      .click();
    await expect.poll(() => session.snapshot().voting.durationMs).toBe(5000);
    await operator.locator('#streamer-color').selectOption('b');
    await operator
      .getByRole('button', { name: 'Start game', exact: true })
      .click();
    await expect(obs.locator('#vote-status')).toContainText('Vote now:');
    const frozen = session.snapshot().game;
    await expect(obs.locator('#vote-status')).toContainText(
      'No votes received.',
      { timeout: 10000 },
    );
    expect(session.snapshot().game.dfen).toBe(frozen.dfen);
    expect(session.snapshot().game.lastTurn).toBeNull();
    await expect(obs.getByRole('button')).toHaveCount(0);
    await expect(
      operator.getByRole('button', { name: 'Extend empty vote', exact: true }),
    ).toBeVisible();
    await operator
      .getByRole('button', { name: 'Extend empty vote', exact: true })
      .click();
    await expect(obs.locator('#vote-status')).toContainText('Vote now:');
    sockets[0]!.receive(voteFrame(vote(Date.now(), 1)));
    const changed = vote(Date.now() + 1, 2);
    // Let the host clock reach the source timestamp before delivery.
    await expect.poll(() => Date.now() >= changed.receivedAtMs).toBe(true);
    sockets[0]!.receive(voteFrame(changed));
    sockets[0]!.receive(voteFrame(changed));
    await expect(obs.locator('#choices')).toContainText('Option 2 · 1 votes');
    await expect(obs.locator('#vote-status')).toContainText('1 voters');
    await expect
      .poll(() => session.snapshot().game.phase, { timeout: 10000 })
      .toBe('streamer-roll');
    const resolved = session.snapshot();
    expect(resolved.game.dfen).toBe(frozen.choices[1]!.resultingDfen);
    expect(resolved.game.lastTurn?.moves).toEqual(frozen.choices[1]!.moves);
    expect(resolved.voting.lastDecision?.winner).toBe(2);
    expect(session.game.resolveChoice(frozen.roundId!, 2)).toBe(false);
    await expect(obs.locator('#phase')).toHaveText('streamer roll');
    await expect(operator.locator('#phase')).toHaveText('streamer roll');
    expect(await operator.locator('#board').getAttribute('data-dfen')).toBe(
      await obs.locator('#board').getAttribute('data-dfen'),
    );
  } finally {
    clearInterval(keepalive);
    await operator.close();
    await obs.close();
    await host.close();
  }
});
