export interface VoteDecision {
  roundId: string;
  closedAtMs: number;
  counts: readonly { option: number; votes: number }[];
  leaders: readonly number[];
  seed: number;
  selectedIndex: number;
  winner: number;
}

export interface PublicVoting {
  phase: 'idle' | 'preview' | 'open' | 'paused' | 'waiting' | 'resolved';
  roundId: string | null;
  durationMs: number;
  openedAtMs: number | null;
  closesAtMs: number | null;
  remainingMs: number;
  counts: readonly { option: number; votes: number }[];
  totalVoters: number;
  lastDecision: VoteDecision | null;
}
