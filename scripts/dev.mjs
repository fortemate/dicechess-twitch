import { spawn } from 'node:child_process';
import { watch } from 'node:fs';

// Serialize rebuilds and restart the host only after the preceding build succeeds.
// Development restarts create new local authority and restore the saved game paused.
let host;
let dirty = true;
let running = false;
let stopping = false;
const run = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code === 0));
  });
async function rebuild() {
  if (running || stopping) return;
  running = true;
  while (dirty && !stopping) {
    dirty = false;
    if (host) {
      const oldHost = host;
      const exited = new Promise((resolve) => oldHost.once('exit', resolve));
      oldHost.kill('SIGTERM');
      await exited;
      host = undefined;
    }
    if ((await run('scripts/build.mjs')) && !stopping) {
      host = spawn(process.execPath, ['dist/host/main.js'], {
        stdio: 'inherit',
      });
      host.on('exit', () => {
        host = undefined;
      });
    }
  }
  running = false;
}
const watcher = watch('src', { recursive: true }, () => {
  dirty = true;
  void rebuild();
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    watcher.close();
    host?.kill('SIGTERM');
  });
}
await rebuild();
