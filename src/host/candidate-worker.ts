import { parentPort, workerData } from 'node:worker_threads';
import { searchCandidates } from '../engine/search.ts';
import type { CandidatePolicy, CandidateRequest } from '../engine/types.ts';

const { request, policy } = workerData as {
  request: CandidateRequest;
  policy: CandidatePolicy;
};
try {
  searchCandidates(request, policy, (progress) =>
    parentPort?.postMessage(progress),
  );
} catch {
  // Neither arbitrary engine error text nor private request/config data crosses this boundary.
  parentPort?.postMessage({
    type: 'done',
    status: 'unavailable',
    reason: 'worker-error',
    scored: [],
    legalPaths: 0,
    uniqueStates: 0,
  });
}
