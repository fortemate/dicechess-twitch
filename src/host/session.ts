import { randomUUID } from 'node:crypto';
import type { OperatorCommand, PublicSnapshot } from '../shared/protocol.ts';

export class Session {
  #snapshot: PublicSnapshot = {
    sessionId: randomUUID(),
    revision: 0,
    updatedAt: new Date().toISOString(),
    phase: 'setup',
    message: 'Preparing the table',
    integration: 'not-connected',
  };

  snapshot(): PublicSnapshot {
    // An explicit projection also prevents future internal fields from leaking.
    const state = this.#snapshot;
    return {
      sessionId: state.sessionId,
      revision: state.revision,
      updatedAt: state.updatedAt,
      phase: state.phase,
      message: state.message,
      integration: state.integration,
    };
  }

  apply(command: OperatorCommand): PublicSnapshot | undefined {
    if (
      command.sessionId !== this.#snapshot.sessionId ||
      command.expectedRevision !== this.#snapshot.revision
    )
      return undefined;
    this.#snapshot = {
      ...this.#snapshot,
      revision: this.#snapshot.revision + 1,
      updatedAt: new Date().toISOString(),
      phase: command.phase,
      message: command.message.trim(),
    };
    return this.snapshot();
  }
}
