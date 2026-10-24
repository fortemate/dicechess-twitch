/** The only state allowed onto the broadcast transport. No configuration or credentials. */
export interface PublicSnapshot {
  sessionId: string;
  revision: number;
  updatedAt: string;
  phase: 'setup' | 'paused';
  message: string;
  integration: 'not-connected';
}

export interface OperatorBootstrap {
  capability: string;
  operatorNote: string;
}

export interface OperatorCommand {
  sessionId: string;
  expectedRevision: number;
  phase: PublicSnapshot['phase'];
  message: string;
}

export function isOperatorCommand(value: unknown): value is OperatorCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return (
    Object.keys(command).length === 4 &&
    typeof command.sessionId === 'string' &&
    Number.isSafeInteger(command.expectedRevision) &&
    (command.phase === 'setup' || command.phase === 'paused') &&
    typeof command.message === 'string' &&
    command.message.trim().length > 0 &&
    command.message.length <= 160
  );
}
