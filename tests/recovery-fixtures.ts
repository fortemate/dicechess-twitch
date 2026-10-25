import { parseCheckpoint } from '../src/host/checkpoint.ts';
import type {
  CheckpointStore,
  SessionCheckpoint,
} from '../src/host/checkpoint.ts';

export class MemoryStore implements CheckpointStore {
  saved: SessionCheckpoint | undefined;
  writes: SessionCheckpoint[] = [];
  fail = false;
  load() {
    return this.saved ? structuredClone(this.saved) : undefined;
  }
  save(value: SessionCheckpoint) {
    if (this.fail) throw new Error('Fixture disk unavailable');
    this.saved = parseCheckpoint(value);
    this.writes.push(this.saved);
  }
  close() {}
}
