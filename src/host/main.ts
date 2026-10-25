import { resolve } from 'node:path';
import { startHost } from './server.ts';
import { Session } from './session.ts';
import { FileStore } from './file-store.ts';

let store: FileStore | undefined;
let session: Session | undefined;

try {
  store = new FileStore(
    process.env.DICECHESS_STATE_FILE ?? resolve('.local/session.json'),
  );
  session = new Session({
    store,
    ...(process.env.TWITCH_CLIENT_ID
      ? { twitchClientId: process.env.TWITCH_CLIENT_ID }
      : {}),
  });
  const host = await startHost({
    operatorPort: 4310,
    obsPort: 4311,
    clientDirectory: resolve('dist/client'),
    session,
  });
  console.log(`Operator: ${host.operatorUrl}`);
  console.log(`OBS (read-only): ${host.obsUrl}`);
  console.log(
    'Saved games resume explicitly. Use the operator page for Twitch authorization.',
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void host.close();
    });
  }
} catch {
  session?.dispose();
  store?.close();
  // Do not dump configuration or request data on startup failures.
  console.error(
    'Unable to start local host. Check ports/build and preserve .local/session.json if recovery failed.',
  );
  process.exitCode = 1;
}
