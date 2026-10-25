export interface PresentedMove {
  uci: string;
  label: string;
  captured: string | null;
  promotion: string | null;
}
export interface PresentedChoice {
  option: number;
  resultingDfen: string;
  moves: readonly PresentedMove[];
  summary: string;
}
export interface PublicPreview {
  phase: 'idle' | 'showing' | 'complete';
  roundId: string | null;
  option: number | null;
  step: number;
  totalSteps: number;
  dfen: string | null;
  from: string | null;
  to: string | null;
  caption: string;
  choices: readonly PresentedChoice[];
}
