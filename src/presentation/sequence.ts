import { DiceChess as Rules } from '@fortemate/dicechess-engine/rules';
import type { CandidateChoice } from '../engine/types.ts';
import type { PresentedChoice, PresentedMove } from '../shared/presentation.ts';

const names: Record<string, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};
export function placement(dfen: string) {
  return dfen
    .split(' ')[0]!
    .replace(/\d/g, (value) => '.'.repeat(Number(value)))
    .replaceAll('/', '');
}
function index(square: string) {
  return (8 - Number(square[1])) * 8 + square.codePointAt(0)! - 97;
}
export interface PreviewFrame {
  dfen: string;
  option: number | null;
  step: number;
  totalSteps: number;
  caption: string;
  from: string | null;
  to: string | null;
}

function capturedPiece(before: string, after: string, white: boolean) {
  let captured: string | null = null;
  for (let square = 0; square < 64; square++) {
    const prior = before[square]!;
    if (
      prior !== '.' &&
      (prior === prior.toUpperCase()) !== white &&
      after[square] !== prior
    )
      captured = names[prior.toLowerCase()] ?? null;
  }
  return captured;
}

function moveLabel(
  piece: string,
  from: string,
  to: string,
  captured: string | null,
  promotion: string | null,
) {
  const castle =
    piece.toLowerCase() === 'k' &&
    Math.abs(from.codePointAt(0)! - to.codePointAt(0)!) === 2;
  if (castle) {
    const flank = to[0]! > from[0]! ? 'kingside' : 'queenside';
    return `Castle ${flank}`;
  }
  const separator = captured ? '×' : '–';
  const capture = captured ? ` · captures ${captured}` : '';
  const promoted = promotion ? ` · promotes to ${promotion}` : '';
  return `${names[piece.toLowerCase()]} ${from}${separator}${to}${capture}${promoted}`;
}

function presentMove(dfen: string, uci: string) {
  const from = uci.slice(0, 2),
    to = uci.slice(2, 4);
  const before = placement(dfen);
  const piece = before[index(from)]!;
  const next = Rules.applyMove(dfen, from, to, uci[4]);
  if (!next || !names[piece.toLowerCase()])
    throw new Error('Invalid preview sequence');
  const captured = capturedPiece(
    before,
    placement(next),
    piece === piece.toUpperCase(),
  );
  const promotion = uci[4] ? (names[uci[4].toLowerCase()] ?? null) : null;
  const move: PresentedMove = {
    uci,
    label: moveLabel(piece, from, to, captured, promotion),
    captured,
    promotion,
  };
  return { next, move, from, to };
}

function choiceSummary(moves: readonly PresentedMove[]) {
  const captures = moves
    .filter((move) => move.captured)
    .map((move) => move.captured);
  const promotions = moves
    .filter((move) => move.promotion)
    .map((move) => move.promotion);
  return [
    captures.length ? `Captures ${captures.join(', ')}` : 'No capture',
    ...(promotions.length ? [`Promotion: ${promotions.join(', ')}`] : []),
  ].join(' · ');
}

function presentChoice(root: string, choice: CandidateChoice) {
  let dfen = root;
  const moves: PresentedMove[] = [];
  const totalSteps = choice.moves.length;
  const frames: PreviewFrame[] = [
    {
      dfen: root,
      option: choice.option,
      step: 0,
      totalSteps,
      caption: `Preview only · Option ${choice.option} · Starting position`,
      from: null,
      to: null,
    },
  ];
  for (const [position, uci] of choice.moves.entries()) {
    const presented = presentMove(dfen, uci);
    moves.push(presented.move);
    dfen = presented.next;
    frames.push({
      dfen,
      option: choice.option,
      step: position + 1,
      totalSteps,
      caption: `Preview only · Option ${choice.option} · ${presented.move.label}`,
      from: presented.from,
      to: presented.to,
    });
  }
  const board = placement(dfen);
  const terminal = !board.includes('K') || !board.includes('k');
  const final = terminal ? dfen : Rules.endTurn(dfen);
  if (!totalSteps || final !== choice.resultingDfen)
    throw new Error('Preview result mismatch');
  const summary = choiceSummary(moves);
  const presented: PresentedChoice = {
    option: choice.option,
    resultingDfen: choice.resultingDfen,
    moves,
    summary,
  };
  frames.push({
    dfen: choice.resultingDfen,
    option: choice.option,
    step: totalSteps,
    totalSteps,
    caption: `Preview only · Option ${choice.option} · Final position · ${summary}`,
    from: null,
    to: null,
  });
  return { presented, frames };
}

/** Apply only the public engine's approved sequence; never update the real game. */
export function presentChoices(
  root: string,
  choices: readonly CandidateChoice[],
): { choices: PresentedChoice[]; frames: PreviewFrame[] } {
  const frames: PreviewFrame[] = [];
  const presented: PresentedChoice[] = [];
  for (const choice of choices) {
    const result = presentChoice(root, choice);
    presented.push(result.presented);
    frames.push(...result.frames);
  }
  return { choices: presented, frames };
}
