import { Worker } from 'node:worker_threads';
import type { MoveTree } from '@fortemate/dicechess-engine';

export function legalTurnTree(
  rolledDfen: string,
  signal: AbortSignal,
): Promise<MoveTree | undefined> {
  if (signal.aborted) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let settled = false;
    let worker: Worker;
    try {
      worker = new Worker(
        new URL(
          import.meta.url.endsWith('.ts')
            ? '../host/rules-worker.ts'
            : './rules-worker.js',
          import.meta.url,
        ),
        {
          workerData: { rolledDfen },
          execArgv: [],
          resourceLimits: { maxOldGenerationSizeMb: 128 },
        },
      );
    } catch {
      resolve(undefined);
      return;
    }
    const finish = (tree?: MoveTree) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      void worker.terminate();
      resolve(tree);
    };
    const cancel = () => finish();
    const timer = setTimeout(cancel, 5000);
    worker.on('message', (reply: { tree?: MoveTree }) => finish(reply.tree));
    worker.on('error', cancel);
    worker.on('exit', () => {
      if (!settled) finish();
    });
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
