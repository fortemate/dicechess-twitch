import type { SocketPort } from '../src/twitch/eventsub.ts';

export const clientId = 'fixtureclient00000000000001';
export const fixtureTokens = {
  access: 'FIXTURE_ACCESS_DO_NOT_PROJECT',
  refresh: 'FIXTURE_REFRESH_DO_NOT_PROJECT',
  device: 'FIXTURE_DEVICE_DO_NOT_PROJECT',
};
export const flush = () =>
  new Promise<void>((resolve) => setImmediate(resolve));
let sequence = 0;
export function packet(
  type: string,
  payload: unknown,
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    metadata: {
      message_id: `event-${sequence++}`,
      message_type: type,
      message_timestamp: '2026-10-25T01:00:00.123456789Z',
      ...extra,
    },
    payload,
  });
}
export const welcome = (id = 'session-a') =>
  packet('session_welcome', { session: { id, keepalive_timeout_seconds: 10 } });
export const chat = (
  messageId = `chat-${sequence++}`,
  userId = '200',
  broadcasterId = '100',
) =>
  packet(
    'notification',
    {
      subscription: {
        id: 'subscription',
        type: 'channel.chat.message',
        version: '1',
        status: 'enabled',
        condition: {
          broadcaster_user_id: broadcasterId,
          user_id: broadcasterId,
        },
      },
      event: {
        broadcaster_user_id: broadcasterId,
        chatter_user_id: userId,
        message_id: messageId,
        message: { text: '!vote 2' },
      },
    },
    { subscription_type: 'channel.chat.message', subscription_version: '1' },
  );

export class FakeSocket implements SocketPort {
  closed = false;
  #message: ((data: string) => void) | undefined;
  #close: (() => void) | undefined;
  #error: (() => void) | undefined;
  onMessage(callback: (data: string) => void) {
    this.#message = callback;
  }
  onClose(callback: () => void) {
    this.#close = callback;
  }
  onError(callback: () => void) {
    this.#error = callback;
  }
  receive(data: string) {
    this.#message?.(data);
  }
  drop() {
    this.closed = true;
    this.#close?.();
  }
  error() {
    this.#error?.();
  }
  close() {
    this.closed = true;
    this.#close?.();
  }
}

export function authFixture(
  options: {
    pending?: number;
    expiresIn?: number;
    verificationUri?: string;
    denyRefresh?: boolean;
    wrongScope?: boolean;
  } = {},
) {
  const calls: {
    url: string;
    authorization: string | null;
    form: URLSearchParams;
    body: unknown;
  }[] = [];
  let polls = 0;
  let refreshes = 0;
  let invalidAccess = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const form =
      init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
    const body: unknown =
      typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({
      url,
      authorization: headers.get('Authorization'),
      form,
      body,
    });
    if (url.endsWith('/oauth2/device'))
      return Response.json({
        device_code: fixtureTokens.device,
        user_code: 'ABCD-EFGH',
        verification_uri:
          options.verificationUri ??
          'https://www.twitch.tv/activate?public=true&device-code=ABCD-EFGH',
        expires_in: options.expiresIn ?? 1800,
        interval: 5,
      });
    if (url.endsWith('/oauth2/token')) {
      if (form.get('grant_type') === 'refresh_token') {
        refreshes++;
        if (options.denyRefresh)
          return Response.json(
            { message: fixtureTokens.refresh },
            { status: 401 },
          );
        invalidAccess = false;
        return Response.json({
          access_token: `REFRESHED_ACCESS_${refreshes}`,
          refresh_token: `REFRESHED_REFRESH_${refreshes}`,
          scope: ['user:read:chat'],
        });
      }
      if (polls++ < (options.pending ?? 0))
        return Response.json(
          { message: 'authorization_pending' },
          { status: 400 },
        );
      return Response.json({
        access_token: fixtureTokens.access,
        refresh_token: fixtureTokens.refresh,
        scope: ['user:read:chat'],
      });
    }
    if (url.endsWith('/oauth2/validate')) {
      if (invalidAccess)
        return Response.json(
          { message: fixtureTokens.access },
          { status: 401 },
        );
      return Response.json({
        client_id: clientId,
        user_id: '100',
        login: 'fixturechannel',
        expires_in: 3600,
        scopes: options.wrongScope ? [] : ['user:read:chat'],
      });
    }
    if (url.endsWith('/eventsub/subscriptions')) {
      if (
        invalidAccess ||
        (headers.get('Authorization') === `Bearer ${fixtureTokens.access}` &&
          refreshes > 0)
      )
        return Response.json(
          { message: fixtureTokens.access },
          { status: 401 },
        );
      const request = body as { transport: { session_id: string } };
      return Response.json(
        {
          data: [
            {
              id: 'subscription-id',
              type: 'channel.chat.message',
              transport: {
                method: 'websocket',
                session_id: request.transport.session_id,
              },
            },
          ],
        },
        { status: 202 },
      );
    }
    throw new Error('Unexpected fixture request');
  };
  return {
    calls,
    fetcher,
    invalidate: () => {
      invalidAccess = true;
    },
    refreshCount: () => refreshes,
  };
}
