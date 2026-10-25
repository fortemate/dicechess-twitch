import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { parseCheckpoint } from './checkpoint.ts';
import type { CheckpointStore, SessionCheckpoint } from './checkpoint.ts';

const maxBytes = 2 * 1024 * 1024;
const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException)?.code === 'ENOENT';

/** Atomic local checkpoints plus one process owner. No credential persistence. */
export class FileStore implements CheckpointStore {
  #file: string;
  #lock: string;
  #nonce = randomBytes(16).toString('hex');
  #closed = false;
  constructor(file: string) {
    this.#file = file;
    this.#lock = `${file}.lock`;
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    if (!lstatSync(dirname(file)).isDirectory())
      throw new Error('Invalid local storage directory');
    this.#acquire();
  }
  #acquire() {
    for (let attempt = 0; attempt < 2; attempt++) {
      let descriptor: number;
      try {
        descriptor = openSync(this.#lock, 'wx', 0o600);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
          throw new Error('Local session storage unavailable');
        try {
          const stat = lstatSync(this.#lock);
          if (!stat.isFile() || stat.size > 1024) throw new Error();
          const saved: unknown = JSON.parse(readFileSync(this.#lock, 'utf8'));
          const pid = (saved as { pid?: unknown })?.pid;
          if (!Number.isSafeInteger(pid) || (pid as number) <= 0)
            throw new Error();
          try {
            process.kill(pid as number, 0);
          } catch (status: unknown) {
            if ((status as NodeJS.ErrnoException).code === 'ESRCH') {
              unlinkSync(this.#lock);
              continue;
            }
          }
        } catch {
          /* Unknown ownership is never overwritten. */
        }
        throw new Error('Local session storage is already in use');
      }
      try {
        writeFileSync(
          descriptor,
          JSON.stringify({ pid: process.pid, nonce: this.#nonce }),
        );
        fsyncSync(descriptor);
      } catch {
        try {
          unlinkSync(this.#lock);
        } catch {
          /* Preserve the original failure. */
        }
        throw new Error('Local session lock unavailable');
      } finally {
        closeSync(descriptor);
      }
      return;
    }
    throw new Error('Local session lock unavailable');
  }
  load(): SessionCheckpoint | undefined {
    if (this.#closed) throw new Error('Local session storage is closed');
    let stat;
    try {
      stat = lstatSync(this.#file);
    } catch (error: unknown) {
      if (missing(error)) return undefined;
      throw new Error('Saved session unavailable');
    }
    if (!stat.isFile() || stat.size > maxBytes)
      throw new Error('Saved session is invalid or unsupported');
    try {
      return parseCheckpoint(JSON.parse(readFileSync(this.#file, 'utf8')));
    } catch {
      throw new Error('Saved session is invalid or unsupported');
    }
  }
  save(checkpoint: SessionCheckpoint) {
    if (this.#closed) throw new Error('Local session storage is closed');
    const encoded = JSON.stringify(parseCheckpoint(checkpoint));
    if (Buffer.byteLength(encoded) > maxBytes)
      throw new Error('Saved session limit reached');
    const temporary = `${this.#file}.${this.#nonce}.tmp`;
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporary, 'wx', 0o600);
      writeFileSync(descriptor, encoded);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporary, this.#file);
      const directory = openSync(dirname(this.#file), 'r');
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    } catch {
      throw new Error('Unable to save local session');
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      try {
        unlinkSync(temporary);
      } catch {
        /* Renamed or unavailable. */
      }
    }
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    try {
      const owner: unknown = JSON.parse(readFileSync(this.#lock, 'utf8'));
      if ((owner as { nonce?: unknown })?.nonce === this.#nonce)
        unlinkSync(this.#lock);
    } catch {
      /* Never remove another owner's lock. */
    }
  }
}
