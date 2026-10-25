/** Non-production only: synthetic positions/fixed dice, no Twitch auth or saved operator game. */
import { resolve } from 'node:path';
import { startHost } from '../../src/host/server.ts';
import { Session } from '../../src/host/session.ts';
import { fixtures } from '../candidate-fixtures.ts';

const scenarios = {
  'forced-pass': { position: fixtures.zero, dice: [1, 1, 1], color: 'White' },
  'single-choice': { position: fixtures.one, dice: [1, 1, 1], color: 'Black' },
  'king-capture': {
    position: fixtures.tactical,
    dice: [1, 1, 5],
    color: 'White',
  },
  promotion: { position: fixtures.promotion, dice: [1, 1, 1], color: 'White' },
  castling: { position: fixtures.castling, dice: [1, 4, 6], color: 'White' },
} as const;
function port(value: string | undefined, fallback: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535)
    throw new Error('Invalid fixture port');
  return parsed;
}
try {
  const name = process.argv[2];
  if (!name || !Object.hasOwn(scenarios, name))
    throw new Error('Unknown fixture');
  const scenario = scenarios[name as keyof typeof scenarios];
  const session = new Session({
    initialDfen: scenario.position.split(' ').slice(0, 6).join(' '),
    roll: () => scenario.dice,
  });
  const current = session.snapshot();
  session.apply({
    action: 'set-message',
    sessionId: current.sessionId,
    expectedRevision: current.controlRevision,
    message: `FIXTURE · ${name} · No Twitch channel`,
  });
  const host = await startHost({
    operatorPort: port(process.env.FIXTURE_OPERATOR_PORT, 4410),
    obsPort: port(process.env.FIXTURE_OBS_PORT, 4411),
    clientDirectory: resolve('dist/client'),
    session,
    operatorNote: `NON-PRODUCTION FIXTURE · Fixed dice · Start as ${scenario.color} · No Twitch or saved game`,
  });
  console.log(
    `NON-PRODUCTION FIXTURE: ${name}. Start as ${scenario.color}. No Twitch authorization or saved game.`,
  );
  console.log(`Operator: ${host.operatorUrl}`);
  console.log(`OBS: ${host.obsUrl}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void host.close();
    });
} catch {
  console.error(
    'Unable to start fixture host. Choose forced-pass, single-choice, king-capture, promotion or castling; check fixture ports and run npm run build.',
  );
  process.exitCode = 1;
}
