import { resolve } from 'node:path';
import { startHost } from './server.ts';

try {
  const host = await startHost({
    operatorPort: 4310,
    obsPort: 4311,
    clientDirectory: resolve('dist/client'),
  });
  console.log(`Operator: ${host.operatorUrl}`);
  console.log(`OBS (read-only): ${host.obsUrl}`);
  console.log(
    'Local game foundation: Twitch voting is not connected. State resets on restart.',
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
