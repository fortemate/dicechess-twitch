import { DiceChess as Rules } from '@fortemate/dicechess-engine/rules';
import type { CandidateChoice } from '../engine/types.ts';
import type { PresentedChoice } from '../shared/presentation.ts';

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
  return (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
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

/** Apply only the public engine's approved sequence; never update the real game. */
export function presentChoices(
  root: string,
  choices: readonly CandidateChoice[],
): { choices: PresentedChoice[]; frames: PreviewFrame[] } {
  const frames: PreviewFrame[] = [];
  const presented: PresentedChoice[] = [];
  for (const choice of choices) {
    let dfen = root;
    const moves: PresentedChoice['moves'][number][] = [];
    const totalSteps = choice.moves.length;
    frames.push({
      dfen: root,
      option: choice.option,
      step: 0,
      totalSteps,
      caption: `Preview only · Option ${choice.option} · Starting position`,
      from: null,
      to: null,
    });
    for (const [position, uci] of choice.moves.entries()) {
      const from = uci.slice(0, 2),
        to = uci.slice(2, 4);
      const before = placement(dfen);
      const piece = before[index(from)]!;
      const next = Rules.applyMove(dfen, from, to, uci[4]);
      if (!next || !names[piece.toLowerCase()])
        throw new Error('Invalid preview sequence');
      const after = placement(next);
      const white = piece === piece.toUpperCase();
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
      const promotion = uci[4] ? (names[uci[4].toLowerCase()] ?? null) : null;
      const castle =
        piece.toLowerCase() === 'k' &&
        Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2;
      const label = castle
        ? `Castle ${to[0]! > from[0]! ? 'kingside' : 'queenside'}`
        : `${names[piece.toLowerCase()]} ${from}${captured ? '×' : '–'}${to}${captured ? ` · captures ${captured}` : ''}${promotion ? ` · promotes to ${promotion}` : ''}`;
      moves.push({ uci, label, captured, promotion });
      dfen = next;
      frames.push({
        dfen,
        option: choice.option,
        step: position + 1,
        totalSteps,
        caption: `Preview only · Option ${choice.option} · ${label}`,
        from,
        to,
      });
    }
    const terminal =
      !placement(dfen).includes('K') || !placement(dfen).includes('k');
    const final = terminal ? dfen : Rules.endTurn(dfen);
    if (!totalSteps || final !== choice.resultingDfen)
      throw new Error('Preview result mismatch');
    const captures = moves
      .filter((move) => move.captured)
      .map((move) => move.captured);
    const promotions = moves
      .filter((move) => move.promotion)
      .map((move) => move.promotion);
    const summary = [
      captures.length ? `Captures ${captures.join(', ')}` : 'No capture',
      ...(promotions.length ? [`Promotion: ${promotions.join(', ')}`] : []),
    ].join(' · ');
    presented.push({
      option: choice.option,
      resultingDfen: choice.resultingDfen,
      moves,
      summary,
    });
    frames.push({
      dfen: choice.resultingDfen,
      option: choice.option,
      step: totalSteps,
      totalSteps,
      caption: `Preview only · Option ${choice.option} · Final position · ${summary}`,
      from: null,
      to: null,
    });
  }
  return { choices: presented, frames };
}
