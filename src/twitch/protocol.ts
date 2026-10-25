import type { ChatMessage } from './types.ts';

export function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function text(value: unknown, max = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
export function numericId(value: unknown): value is string {
  return text(value, 32) && /^\d+$/.test(value);
}
export function isTimestamp(value: unknown): value is string {
  return (
    text(value, 64) &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

export type EventSubPacket =
  | { type: 'welcome'; sessionId: string; keepaliveSeconds: number }
  | { type: 'keepalive' }
  | { type: 'reconnect'; url: string }
  | { type: 'revocation' }
  | { type: 'chat'; event: ChatMessage };

export function decodeEventSub(
  raw: string,
  broadcasterId: string,
  receivedAtMs: number,
): EventSubPacket | undefined {
  if (raw.length > 262144) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const root = record(parsed);
  const metadata = record(root?.metadata);
  const payload = record(root?.payload);
  if (
    !metadata ||
    !payload ||
    !text(metadata.message_id) ||
    !isTimestamp(metadata.message_timestamp)
  )
    return undefined;
  const session = record(payload.session);
  switch (metadata.message_type) {
    case 'session_welcome': {
      const keepalive = session?.keepalive_timeout_seconds;
      return text(session?.id) &&
        typeof keepalive === 'number' &&
        Number.isInteger(keepalive) &&
        keepalive >= 10 &&
        keepalive <= 600
        ? {
            type: 'welcome',
            sessionId: session.id,
            keepaliveSeconds: keepalive,
          }
        : undefined;
    }
    case 'session_keepalive':
      return { type: 'keepalive' };
    case 'session_reconnect':
      return text(session?.reconnect_url, 2048)
        ? { type: 'reconnect', url: session.reconnect_url }
        : undefined;
    case 'revocation': {
      const subscription = record(payload.subscription);
      const condition = record(subscription?.condition);
      return subscription?.type === 'channel.chat.message' &&
        condition?.broadcaster_user_id === broadcasterId
        ? { type: 'revocation' }
        : undefined;
    }
    case 'notification': {
      const subscription = record(payload.subscription);
      const condition = record(subscription?.condition);
      const event = record(payload.event);
      const message = record(event?.message);
      if (
        metadata.subscription_type !== 'channel.chat.message' ||
        subscription?.type !== 'channel.chat.message' ||
        subscription.version !== '1' ||
        condition?.broadcaster_user_id !== broadcasterId ||
        condition.user_id !== broadcasterId ||
        event?.broadcaster_user_id !== broadcasterId ||
        !numericId(event.chatter_user_id) ||
        !text(event.message_id) ||
        typeof message?.text !== 'string' ||
        message.text.length > 2048
      )
        return undefined;
      return {
        type: 'chat',
        event: {
          broadcasterId,
          userId: event.chatter_user_id,
          messageId: event.message_id,
          eventId: metadata.message_id,
          sentAt: metadata.message_timestamp,
          receivedAtMs,
          text: message.text,
        },
      };
    }
    default:
      return undefined;
  }
}

export function validReconnectUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'wss:' &&
      url.hostname === 'eventsub.wss.twitch.tv' &&
      (!url.port || url.port === '443') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
