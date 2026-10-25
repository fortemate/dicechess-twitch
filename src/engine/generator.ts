import { Worker } from 'node:worker_threads';
import { candidatePolicy } from './types.ts';
import type {
  CandidateRequest,
  CandidateResult,
  CandidatePolicy,
  WorkerProgress,
} from './types.ts';
import { selectTurns, shuffle } from './selection.ts';

export async function generateCandidates(
  input: CandidateRequest,
  options: { signal?: AbortSignal; policy?: CandidatePolicy } = {},
): Promise<CandidateResult> {
  const request = Object.freeze({ ...input });
  const policy = Object.freeze({ ...(options.policy ?? candidatePolicy) });
  const started = performance.now();
  let latest: WorkerProgress = {
    type: 'progress',
    status: 'unavailable',
    reason: 'deadline',
    scored: [],
    legalPaths: 0,
    uniqueStates: 0,
  };
  const result = (progress: WorkerProgress): CandidateResult => {
    const selected = shuffle(
      selectTurns(progress.scored, policy.qualityMargin),
      request.seed,
    );
    return Object.freeze({
      request,
      status: progress.status,
      reason: progress.reason,
      choices: Object.freeze(
        selected.map((turn, index) =>
          Object.freeze({
            option: index + 1,
            moves: Object.freeze([...turn.moves]),
            resultingDfen: turn.resultingDfen,
          }),
        ),
      ),
      analysis: Object.freeze({
        basis: 'engine-equity-v1',
        scored: Object.freeze(
          progress.scored.map((turn) =>
            Object.freeze({ ...turn, moves: Object.freeze([...turn.moves]) }),
          ),
        ),
        legalPaths: progress.legalPaths,
        uniqueStates: progress.uniqueStates,
        elapsedMs: performance.now() - started,
      }),
    });
  };
  if (options.signal?.aborted)
    return result({ ...latest, reason: 'cancelled' });
  const worker = new Worker(
    new URL(
      import.meta.url.endsWith('.ts')
        ? '../host/candidate-worker.ts'
        : './candidate-worker.js',
      import.meta.url,
    ),
    {
      workerData: { request, policy },
      // This pinned Node runtime loads .ts natively. Parent-only CLI/test flags
      // (including --input-type) must not be forwarded to a file worker.
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    },
  );
  return new Promise((resolve) => {
    let settled = false;
    const finish = (progress: WorkerProgress) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', cancel);
      void worker.terminate();
      resolve(result(progress));
    };
    const cancel = () =>
      finish({
        ...latest,
        status: 'unavailable',
        reason: 'cancelled',
        scored: [],
      });
    const failed = () =>
      finish({
        ...latest,
        status: 'unavailable',
        reason: 'worker-error',
        scored: [],
      });
    const timeout = setTimeout(
      () => finish({ ...latest, reason: 'deadline' }),
      policy.hardDeadlineMs,
    );
    worker.on('message', (progress: WorkerProgress) => {
      latest = progress;
      if (progress.type === 'done') finish(progress);
    });
    worker.on('error', failed);
    worker.on('exit', () => {
      if (!settled) failed();
    });
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
  });
}
