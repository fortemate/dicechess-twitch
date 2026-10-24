import { parentPort, workerData } from 'node:worker_threads';
import { DiceChess } from '@fortemate/dicechess-engine';
import { isRolledPosition } from '../engine/search.ts';

try {
  const { rolledDfen } = workerData as { rolledDfen: string };
  parentPort?.postMessage(
    isRolledPosition(rolledDfen)
      ? { tree: DiceChess.getLegalTurnTree(rolledDfen) }
      : {},
  );
} catch {
  parentPort?.postMessage({});
}
