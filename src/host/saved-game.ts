import type { CandidateChoice, CandidateResult } from '../engine/types.ts';
import type { Color, GamePhase, TurnRecord } from '../shared/game.ts';

export type RetainedCandidates = Pick<
  CandidateResult,
  'request' | 'status' | 'reason' | 'choices'
>;
export interface SavedAnimation {
  choice: CandidateChoice;
  reason: 'chat-choice' | 'single-choice';
  nextIndex: number;
}
/** Explicit durable projection. No search diagnostics, chat voters or authorization. */
export interface SavedGame {
  gameId: string | null;
  startingDfen: string;
  dfen: string;
  positionVersion: number;
  phase: GamePhase;
  resumePhase: GamePhase | null;
  streamerColor: Color;
  rolledDfen: string | null;
  roundId: string | null;
  moves: readonly string[];
  candidates: RetainedCandidates | null;
  animation: SavedAnimation | null;
  resolvedRounds: readonly string[];
  winner: Color | null;
  history: readonly TurnRecord[];
  pendingPass: boolean;
  chatUnavailable: boolean;
}
