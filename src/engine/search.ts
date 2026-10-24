import { DiceChess } from '@fortemate/dicechess-engine';
import type { MoveTree } from '@fortemate/dicechess-engine';
import type {
  CandidatePolicy,
  CandidateRequest,
  ScoredTurn,
  WorkerProgress,
} from './types.ts';
import { distance, ruleStateKey } from './selection.ts';

export interface LegalTurn {
  moves: string[];
  resultingDfen: string;
  ruleKey: string;
  terminalWin: boolean;
}

export function isRolledPosition(dfen: string): boolean {
  const fields = dfen.split(' ');
  const dice = fields[6];
  if (fields.length !== 7 || !dice || dice.length > 3) return false;
  if (!(fields[1] === 'w' ? /^[PNBRQK]+$/ : /^[pnbrqk]+$/).test(dice))
    return false;
  const placement = fields[0] ?? '';
  return (
    placement.split('K').length === 2 &&
    placement.split('k').length === 2 &&
    DiceChess.canonicalKey(dfen) !== undefined
  );
}

export function applyUci(dfen: string, uci: string): string {
  const next = DiceChess.applyMove(
    dfen,
    uci.slice(0, 2),
    uci.slice(2, 4),
    uci[4],
  );
  if (!next) throw new Error('Engine rejected its legal turn path');
  return next;
}

/** Only walk the frozen root tree. Never regenerate legality after a micro-move. */
export function enumerateTurns(
  rolledDfen: string,
  pathLimit: number,
  stop: () => boolean = () => false,
  preferredMoves: readonly string[] = [],
) {
  const tree = DiceChess.getLegalTurnTree(rolledDfen);
  const mover = rolledDfen.split(' ')[1];
  const enemyKing = mover === 'w' ? 'k' : 'K';
  const unique = new Map<string, LegalTurn>();
  let paths = 0;
  let limited = false;
  function walk(node: MoveTree, state: string, moves: string[]) {
    const preferred = moves.every(
      (move, index) => move === preferredMoves[index],
    )
      ? preferredMoves[moves.length]
      : undefined;
    const entries = Object.entries(node);
    if (preferred)
      entries.sort(
        ([a], [b]) => Number(b === preferred) - Number(a === preferred),
      );
    for (const [uci, child] of entries) {
      if (paths >= pathLimit || stop()) {
        limited = true;
        return;
      }
      const next = applyUci(state, uci);
      const sequence = [...moves, uci];
      if (Object.keys(child).length > 0) walk(child, next, sequence);
      else {
        paths++;
        const terminalWin = !next.split(' ')[0]!.includes(enemyKing);
        // A king capture terminates immediately, even with dice left.
        const resultingDfen = terminalWin ? next : DiceChess.endTurn(next);
        if (!resultingDfen) throw new Error('Engine rejected endTurn');
        const ruleKey = ruleStateKey(resultingDfen);
        if (!unique.has(ruleKey))
          unique.set(ruleKey, {
            moves: sequence,
            resultingDfen,
            ruleKey,
            terminalWin,
          });
      }
      if (limited) return;
    }
  }
  walk(tree, rolledDfen, []);
  return {
    turns: [...unique.values()],
    paths,
    limited,
    emptyTree: Object.keys(tree).length === 0,
  };
}

function sampleTurns(
  turns: LegalTurn[],
  limit: number,
  suggestedMoves: string[],
): LegalTurn[] {
  const terminal = turns.filter((turn) => turn.terminalWin);
  const pool = terminal.length ? terminal : turns;
  const suggested = pool.find(
    (turn) => turn.moves.join(',') === suggestedMoves.join(','),
  );
  const selected = [suggested ?? pool[0]!];
  const used = new Set(selected.map((turn) => turn.ruleKey));
  while (selected.length < Math.min(limit, pool.length)) {
    let next: LegalTurn | undefined;
    let bestDistance = -1;
    for (const turn of pool) {
      if (used.has(turn.ruleKey)) continue;
      const nearest = Math.min(
        ...selected.map((chosen) => distance(chosen, turn)),
      );
      if (nearest > bestDistance) {
        bestDistance = nearest;
        next = turn;
      }
    }
    if (!next) break;
    selected.push(next);
    used.add(next.ruleKey);
  }
  return selected;
}

export function searchCandidates(
  request: CandidateRequest,
  policy: CandidatePolicy,
  report: (progress: WorkerProgress) => void,
) {
  const started = performance.now();
  const expired = () => performance.now() - started >= policy.softDeadlineMs;
  const scored: ScoredTurn[] = [];
  let legalPaths = 0;
  let uniqueStates = 0;
  const emit = (
    type: WorkerProgress['type'],
    status: WorkerProgress['status'],
    reason: WorkerProgress['reason'],
  ) =>
    report({
      type,
      status,
      reason,
      scored: [...scored],
      legalPaths,
      uniqueStates,
    });
  if (!isRolledPosition(request.rolledDfen)) {
    emit('done', 'unavailable', 'invalid-position');
    return;
  }
  // Visit the engine's complete-turn suggestion first, so a traversal cap does
  // not discard it. Its bot score is never compared with equity utility.
  const suggested = DiceChess.getBestMove(request.rolledDfen, {
    algorithm: 'greedy-v2',
  }).moves.map((move) => `${move.from}${move.to}${move.promotion ?? ''}`);
  const legal = enumerateTurns(
    request.rolledDfen,
    policy.pathLimit,
    expired,
    suggested,
  );
  legalPaths = legal.paths;
  uniqueStates = legal.turns.length;
  if (legal.emptyTree) {
    emit('done', 'forced-pass', 'complete');
    return;
  }
  if (!legal.turns.length || expired()) {
    emit('done', 'unavailable', 'deadline');
    return;
  }
  const samples = sampleTurns(legal.turns, policy.sampleLimit, suggested);
  const perspective = request.rolledDfen.split(' ')[1];
  for (const turn of samples) {
    if (expired()) break;
    let utility = 1;
    if (!turn.terminalWin) {
      const equity = DiceChess.estimateEquity(turn.resultingDfen, {
        rollouts: policy.rolloutCount,
        maxPlies: policy.rolloutPlies,
        seed: request.seed,
      });
      if (equity.rollouts !== policy.rolloutCount)
        throw new Error('Engine returned an invalid equity estimate');
      utility =
        (perspective === 'w' ? equity.whiteWin : equity.blackWin) +
        equity.undecided / 2;
    }
    if (!Number.isFinite(utility) || utility < 0 || utility > 1)
      throw new Error('Invalid candidate utility');
    scored.push({ ...turn, utility });
    emit('progress', 'ready', 'sampled');
  }
  const reason = expired()
    ? 'deadline'
    : legal.limited || scored.length < legal.turns.length
      ? 'sampled'
      : 'complete';
  emit('done', scored.length ? 'ready' : 'unavailable', reason);
}
