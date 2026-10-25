export interface CandidateRequest {
  sessionId: string;
  positionVersion: number;
  roundId: string;
  rolledDfen: string;
  seed: number;
}

export interface ScoredTurn {
  moves: readonly string[];
  resultingDfen: string;
  ruleKey: string;
  utility: number;
  terminalWin: boolean;
}

export interface CandidateChoice {
  option: number;
  moves: readonly string[];
  resultingDfen: string;
}

export interface CandidateResult {
  request: Readonly<CandidateRequest>;
  status: 'ready' | 'forced-pass' | 'unavailable';
  reason:
    | 'complete'
    | 'sampled'
    | 'deadline'
    | 'invalid-position'
    | 'worker-error'
    | 'cancelled';
  choices: readonly CandidateChoice[];
  /** Host-only diagnostics, never broadcast this object directly. */
  analysis: {
    basis: 'engine-equity-v1';
    scored: readonly ScoredTurn[];
    legalPaths: number;
    uniqueStates: number;
    elapsedMs: number;
  };
}

export interface CandidatePolicy {
  sampleLimit: number;
  rolloutCount: number;
  rolloutPlies: number;
  qualityMargin: number;
  softDeadlineMs: number;
  hardDeadlineMs: number;
  pathLimit: number;
}

// New application defaults, not imported from any production search profile.
export const candidatePolicy: Readonly<CandidatePolicy> = Object.freeze({
  sampleLimit: 8,
  rolloutCount: 4,
  rolloutPlies: 4,
  qualityMargin: 0.08,
  softDeadlineMs: 4000,
  hardDeadlineMs: 5000,
  pathLimit: 25000,
});

export interface WorkerProgress {
  type: 'progress' | 'done';
  status: CandidateResult['status'];
  reason: CandidateResult['reason'];
  scored: ScoredTurn[];
  legalPaths: number;
  uniqueStates: number;
}
