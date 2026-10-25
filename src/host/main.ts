import { resolve } from 'node:path';
import { startHost } from './server.ts';
import { Session } from './session.ts';

try {
  const host = await startHost({
    operatorPort: 4310,
    obsPort: 4311,
    clientDirectory: resolve('dist/client'),
    session: new Session({
      ...(process.env.TWITCH_CLIENT_ID
        ? { twitchClientId: process.env.TWITCH_CLIENT_ID }
        : {}),
    }),
  });
  console.log(`Operator: ${host.operatorUrl}`);
  console.log(`OBS (read-only): ${host.obsUrl}`);
  console.log(
    'Use the operator page for Twitch authorization. State resets on restart.',
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void host.close();
    });
  }
} catch {
  // Do not dump configuration or request data on startup failures.
  console.error(
    'Unable to start local host. Check ports 4310/4311 and run npm run build.',
  );
  process.exitCode = 1;
}
