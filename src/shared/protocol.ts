import type { Color, PublicGame } from './game.ts';
import type { TwitchPublicState } from '../twitch/types.ts';
import type { PublicPreview } from './presentation.ts';
import type { PublicVoting } from './voting.ts';
import { compareCodeUnits } from './order.ts';

/** The only state allowed onto the broadcast transport. No configuration or credentials. */
export interface PublicSnapshot {
  sessionId: string;
  revision: number;
  /** Revision of meaningful operator state; commands use this, not display ordering. */
  controlRevision: number;
  updatedAt: string;
  message: string;
  integration: 'not-connected' | 'connected';
  twitch: TwitchPublicState;
  game: PublicGame;
  voting: PublicVoting;
  preview: PublicPreview;
  storage: { enabled: boolean; healthy: boolean; restored: boolean };
}

export interface OperatorBootstrap {
  capability: string;
  operatorNote: string;
}

interface CommandIdentity {
  sessionId: string;
  /** Must match PublicSnapshot.controlRevision. */
  expectedRevision: number;
}

export type OperatorCommand = CommandIdentity &
  (
    | { action: 'set-message'; message: string }
    | { action: 'start'; streamerColor: Color }
    | { action: 'move'; uci: string }
    | { action: 'set-vote-duration'; seconds: number }
    | {
        action:
          | 'roll'
          | 'pause'
          | 'resume'
          | 'rematch'
          | 'twitch-connect'
          | 'twitch-disconnect'
          | 'extend-vote'
          | 'retry-save';
      }
  );

export function isOperatorCommand(value: unknown): value is OperatorCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  if (
    typeof command.sessionId !== 'string' ||
    !Number.isSafeInteger(command.expectedRevision)
  )
    return false;
  const keys = Object.keys(command).sort(compareCodeUnits).join(',');
  switch (command.action) {
    case 'set-message':
      return (
        keys === 'action,expectedRevision,message,sessionId' &&
        typeof command.message === 'string' &&
        command.message.trim().length > 0 &&
        command.message.length <= 160
      );
    case 'start':
      return (
        keys === 'action,expectedRevision,sessionId,streamerColor' &&
        (command.streamerColor === 'w' || command.streamerColor === 'b')
      );
    case 'move':
      return (
        keys === 'action,expectedRevision,sessionId,uci' &&
        typeof command.uci === 'string' &&
        /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(command.uci)
      );
    case 'set-vote-duration':
      return (
        keys === 'action,expectedRevision,seconds,sessionId' &&
        typeof command.seconds === 'number' &&
        Number.isInteger(command.seconds) &&
        command.seconds >= 5 &&
        command.seconds <= 120
      );
    case 'roll':
    case 'pause':
    case 'resume':
    case 'rematch':
    case 'twitch-connect':
    case 'twitch-disconnect':
    case 'extend-vote':
    case 'retry-save':
      return keys === 'action,expectedRevision,sessionId';
    default:
      return false;
  }
}
