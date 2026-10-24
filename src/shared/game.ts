import type { CandidateChoice } from '../engine/types.ts';

export type Color = 'w' | 'b';
export type GamePhase =
  | 'idle'
  | 'streamer-roll'
  | 'streamer-preparing'
  | 'streamer-turn'
  | 'chat-roll'
  | 'chat-preparing'
  | 'preview'
  | 'voting'
  | 'resolving'
  | 'chat-animation'
  | 'paused'
  | 'game-over';

export interface TurnRecord {
  side: Color;
  rolledDfen: string;
  moves: readonly string[];
  resultingDfen: string;
  reason: 'streamer' | 'chat-choice' | 'single-choice' | 'forced-pass';
  roundId: string | null;
}

export interface PublicGame {
  gameId: string | null;
  positionVersion: number;
  phase: GamePhase;
  resumePhase: GamePhase | null;
  dfen: string;
  streamerColor: Color;
  rolledDfen: string | null;
  dice: string;
  roundId: string | null;
  choices: readonly CandidateChoice[];
  announcement: string;
  winner: Color | null;
  lastTurn: TurnRecord | null;
}

export interface OperatorGameState {
  sessionId: string;
  revision: number;
  legalActions: readonly string[];
  canStart: boolean;
  canRoll: boolean;
  canPause: boolean;
  canResume: boolean;
  canRematch: boolean;
}
