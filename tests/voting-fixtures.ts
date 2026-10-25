import type { CandidateRequest, CandidateResult } from '../src/engine/types.ts';
import { enumerateTurns } from '../src/engine/search.ts';
import type { ChatMessage } from '../src/twitch/types.ts';
import { packet } from './twitch-fixtures.ts';

export async function twoCandidates(
  request: CandidateRequest,
): Promise<CandidateResult> {
  const legal = enumerateTurns(request.rolledDfen, 25000);
  const turns = legal.turns.slice(0, 2);
  return {
    request,
    status: 'ready',
    reason: 'complete',
    choices: turns.map((turn, index) => ({
      option: index + 1,
      moves: turn.moves,
      resultingDfen: turn.resultingDfen,
    })),
    analysis: {
      basis: 'engine-equity-v1',
      scored: turns.map((turn) => ({ ...turn, utility: 0.5 })),
      legalPaths: legal.paths,
      uniqueStates: legal.turns.length,
      elapsedMs: 0,
    },
  };
}
let sequence = 0;
export function vote(
  now: number,
  option = 1,
  userId = '200',
  changes: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    broadcasterId: '100',
    userId,
    messageId: `message-${sequence++}`,
    eventId: `vote-event-${sequence++}`,
    sentAt: new Date(now).toISOString(),
    receivedAtMs: now,
    text: `!vote ${option}`,
    ...changes,
  };
}
export function voteFrame(message: ChatMessage) {
  return packet(
    'notification',
    {
      subscription: {
        id: 'fixture-subscription',
        type: 'channel.chat.message',
        version: '1',
        condition: {
          broadcaster_user_id: message.broadcasterId,
          user_id: message.broadcasterId,
        },
      },
      event: {
        broadcaster_user_id: message.broadcasterId,
        chatter_user_id: message.userId,
        message_id: message.messageId,
        message: { text: message.text },
      },
    },
    {
      subscription_type: 'channel.chat.message',
      message_id: message.eventId,
      message_timestamp: message.sentAt,
    },
  );
}
