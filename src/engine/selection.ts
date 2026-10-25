import type { ScoredTurn } from './types.ts';

/** Exact orientation, unlike the engine's symmetry-class canonicalKey. Clocks
 * are diagnostic in this king-capture MVP; they do not define another card. */
export function ruleStateKey(dfen: string): string {
  const fields = dfen.split(' ');
  const placement = fields[0] ?? '';
  // After king capture no remaining die or castling/EP flag can affect play.
  if (!placement.includes('K') || !placement.includes('k')) {
    return `${placement} terminal-${placement.includes('K') ? 'white' : 'black'}`;
  }
  return [
    ...fields.slice(0, 4),
    [...(fields[6] ?? '')].sort().join('') || '-',
  ].join(' ');
}

function board(dfen: string): string {
  return dfen
    .split(' ')[0]!
    .replace(/\d/g, (empty) => '.'.repeat(Number(empty)))
    .replaceAll('/', '');
}

export function distance(
  a: Pick<ScoredTurn, 'resultingDfen' | 'ruleKey'>,
  b: Pick<ScoredTurn, 'resultingDfen' | 'ruleKey'>,
): number {
  const left = board(a.resultingDfen);
  const right = board(b.resultingDfen);
  let different = 0;
  for (let index = 0; index < 64; index++)
    if (left[index] !== right[index]) different++;
  // Rule metadata can distinguish the same visible board (e.g. lost castling rights).
  return different || (a.ruleKey === b.ruleKey ? 0 : 1);
}

/** Preserve the maximum shared-basis score first, then prefer different outcomes
 * within the quality band. Never fill a card with a lower-quality outlier. */
export function selectTurns(
  scored: readonly ScoredTurn[],
  margin: number,
): ScoredTurn[] {
  const ranked = [...scored].sort(
    (a, b) =>
      b.utility - a.utility ||
      a.moves.join(',').localeCompare(b.moves.join(',')),
  );
  const best = ranked[0];
  if (!best) return [];
  const eligible = ranked.filter(
    (turn) =>
      turn.utility >= best.utility - margin &&
      turn.terminalWin === best.terminalWin,
  );
  const selected = [best];
  const used = new Set([best.ruleKey]);
  while (selected.length < 3) {
    let next: ScoredTurn | undefined;
    let greatestDistance = -1;
    for (const turn of eligible) {
      if (used.has(turn.ruleKey)) continue;
      const nearest = Math.min(
        ...selected.map((chosen) => distance(chosen, turn)),
      );
      if (nearest > greatestDistance) {
        greatestDistance = nearest;
        next = turn;
      }
    }
    if (!next) break;
    selected.push(next);
    used.add(next.ruleKey);
  }
  return selected;
}

export function shuffle<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
