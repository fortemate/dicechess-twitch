import { AuthorizationRequired } from './eventsub.ts';
import { numericId, record, text } from './protocol.ts';
import type { Activation } from './types.ts';

const scope = 'user:read:chat';
export type AuthPhase =
  | 'not-configured'
  | 'offline'
  | 'authorizing'
  | 'authorized'
  | 'revoked'
  | 'error';
interface Identity {
  userId: string;
  login: string;
}
interface Tokens {
  access: string;
  refresh: string;
}
interface Options {
  clientId?: string;
  changed: () => void;
  authorized: (identity: Identity) => void;
  fetcher?: typeof fetch;
}

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

/** Runtime-only OAuth material. No method returns an access/refresh/device token. */
export class TwitchAuth {
  #options: Options;
  #clientId: string | undefined;
  #phase: AuthPhase;
  #tokens: Tokens | undefined;
  #identity: Identity | undefined;
  #activation: Activation | undefined;
  #attempt: AbortController | undefined;
  #validationTimer: ReturnType<typeof setTimeout> | undefined;
  #refreshing: Promise<void> | undefined;

  constructor(options: Options) {
    this.#options = options;
    this.#clientId =
      options.clientId && /^[a-z0-9]{10,64}$/i.test(options.clientId)
        ? options.clientId
        : undefined;
    this.#phase = this.#clientId ? 'offline' : 'not-configured';
  }
  state() {
    return {
      phase: this.#phase,
      identity: this.#identity ? { ...this.#identity } : null,
    };
  }
  operatorState() {
    return {
      canConnect:
        !!this.#clientId &&
        ['offline', 'revoked', 'error'].includes(this.#phase),
      canDisconnect: ['authorizing', 'authorized'].includes(this.#phase),
      activation: this.#activation ? { ...this.#activation } : null,
    };
  }
  connect(): boolean {
    if (!this.operatorState().canConnect) return false;
    this.#clear();
    const attempt = new AbortController();
    this.#attempt = attempt;
    this.#phase = 'authorizing';
    this.#options.changed();
    void this.#authorize(attempt);
    return true;
  }
  disconnect() {
    this.#clear();
    this.#phase = this.#clientId ? 'offline' : 'not-configured';
    this.#options.changed();
  }
  invalidate() {
    this.#clear();
    this.#phase = 'revoked';
    this.#options.changed();
  }

  async #request(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Response> {
    try {
      return await (this.#options.fetcher ?? fetch)(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
    } catch {
      throw new Error('Twitch request failed');
    }
  }
  async #body(response: Response): Promise<Record<string, unknown>> {
    try {
      const body = await response.text();
      if (body.length > 65536) throw new Error();
      const value = record(JSON.parse(body));
      if (!value) throw new Error();
      return value;
    } catch {
      throw new Error('Invalid Twitch response');
    }
  }
  #readTokens(value: Record<string, unknown>): Tokens {
    if (
      !text(value.access_token, 4096) ||
      !text(value.refresh_token, 4096) ||
      !Array.isArray(value.scope) ||
      !value.scope.includes(scope)
    )
      throw new AuthorizationRequired();
    return { access: value.access_token, refresh: value.refresh_token };
  }
  async #validate(access: string, signal: AbortSignal): Promise<Identity> {
    const response = await this.#request(
      'https://id.twitch.tv/oauth2/validate',
      { headers: { Authorization: `OAuth ${access}` } },
      signal,
    );
    if (response.status === 401) throw new AuthorizationRequired();
    if (!response.ok) throw new Error('Twitch validation failed');
    const body = await this.#body(response);
    if (
      body.client_id !== this.#clientId ||
      !numericId(body.user_id) ||
      !text(body.login, 25) ||
      !/^[a-z0-9_]+$/.test(body.login) ||
      !Array.isArray(body.scopes) ||
      !body.scopes.includes(scope) ||
      typeof body.expires_in !== 'number' ||
      body.expires_in <= 0
    )
      throw new AuthorizationRequired();
    return { userId: body.user_id, login: body.login };
  }

  async #authorize(attempt: AbortController) {
    try {
      const response = await this.#request(
        'https://id.twitch.tv/oauth2/device',
        {
          method: 'POST',
          body: new URLSearchParams({
            client_id: this.#clientId!,
            scopes: scope,
          }),
        },
        attempt.signal,
      );
      if (!response.ok) throw new Error('Device authorization unavailable');
      const body = await this.#body(response);
      if (
        !text(body.device_code, 4096) ||
        !text(body.user_code, 32) ||
        !text(body.verification_uri, 2048) ||
        typeof body.expires_in !== 'number' ||
        body.expires_in <= 0 ||
        body.expires_in > 86400 ||
        typeof body.interval !== 'number' ||
        !Number.isInteger(body.interval) ||
        body.interval < 1 ||
        body.interval > 60
      )
        throw new Error('Invalid device authorization');
      const uri = new URL(body.verification_uri);
      if (
        uri.protocol !== 'https:' ||
        !['www.twitch.tv', 'twitch.tv'].includes(uri.hostname) ||
        uri.pathname !== '/activate' ||
        uri.username ||
        uri.password ||
        (uri.port && uri.port !== '443')
      )
        throw new Error('Invalid activation destination');
      // Twitch can omit the public-client mode from verification_uri. Without
      // it, the activation page rejects an otherwise matching device user code.
      uri.searchParams.set('public', 'true');
      if (this.#attempt !== attempt || attempt.signal.aborted) return;
      const expiresAtMs = Date.now() + body.expires_in * 1000;
      this.#activation = {
        userCode: body.user_code,
        verificationUri: uri.toString(),
        expiresAtMs,
      };
      this.#options.changed();
      let interval = body.interval * 1000;
      while (
        Date.now() < expiresAtMs &&
        (await wait(interval, attempt.signal))
      ) {
        if (Date.now() >= expiresAtMs) break;
        const tokenResponse = await this.#request(
          'https://id.twitch.tv/oauth2/token',
          {
            method: 'POST',
            body: new URLSearchParams({
              client_id: this.#clientId!,
              scopes: scope,
              device_code: body.device_code,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
          },
          attempt.signal,
        );
        const tokenBody = await this.#body(tokenResponse);
        if (!tokenResponse.ok) {
          if (tokenBody.message === 'authorization_pending') continue;
          if (
            tokenBody.message === 'slow_down' ||
            tokenBody.error === 'slow_down'
          ) {
            interval = Math.min(60000, interval + 5000);
            continue;
          }
          throw new AuthorizationRequired();
        }
        const tokens = this.#readTokens(tokenBody);
        const identity = await this.#validate(tokens.access, attempt.signal);
        if (this.#attempt !== attempt || attempt.signal.aborted) return;
        this.#tokens = tokens;
        this.#identity = identity;
        this.#activation = undefined;
        this.#phase = 'authorized';
        this.#options.changed();
        this.#scheduleValidation(attempt);
        this.#options.authorized(identity);
        return;
      }
      if (!attempt.signal.aborted) throw new AuthorizationRequired();
    } catch (error: unknown) {
      if (this.#attempt !== attempt || attempt.signal.aborted) return;
      this.#clear();
      this.#phase =
        error instanceof AuthorizationRequired ? 'revoked' : 'error';
      this.#options.changed();
    }
  }

  async #refresh(): Promise<void> {
    if (this.#refreshing) return this.#refreshing;
    const attempt = this.#attempt;
    const tokens = this.#tokens;
    if (!attempt || !tokens) throw new AuthorizationRequired();
    const pending = (async () => {
      const response = await this.#request(
        'https://id.twitch.tv/oauth2/token',
        {
          method: 'POST',
          body: new URLSearchParams({
            client_id: this.#clientId!,
            refresh_token: tokens.refresh,
            grant_type: 'refresh_token',
          }),
        },
        attempt.signal,
      );
      if (!response.ok) throw new AuthorizationRequired();
      const updated = this.#readTokens(await this.#body(response));
      const identity = await this.#validate(updated.access, attempt.signal);
      if (
        attempt !== this.#attempt ||
        attempt.signal.aborted ||
        identity.userId !== this.#identity?.userId
      )
        throw new AuthorizationRequired();
      this.#tokens = updated;
    })();
    this.#refreshing = pending;
    try {
      await pending;
    } finally {
      if (this.#refreshing === pending) this.#refreshing = undefined;
    }
  }

  #scheduleValidation(attempt: AbortController) {
    clearTimeout(this.#validationTimer);
    this.#validationTimer = setTimeout(() => {
      void (async () => {
        try {
          if (
            !this.#tokens ||
            this.#attempt !== attempt ||
            attempt.signal.aborted
          )
            return;
          try {
            const identity = await this.#validate(
              this.#tokens.access,
              attempt.signal,
            );
            if (identity.userId !== this.#identity?.userId)
              throw new AuthorizationRequired();
          } catch (error: unknown) {
            if (!(error instanceof AuthorizationRequired)) throw error;
            await this.#refresh();
          }
          if (this.#attempt === attempt && !attempt.signal.aborted)
            this.#scheduleValidation(attempt);
        } catch {
          if (this.#attempt === attempt && !attempt.signal.aborted)
            this.invalidate();
        }
      })();
    }, 3600000);
  }

  async subscribeChat(sessionId: string, signal: AbortSignal): Promise<void> {
    const attempt = this.#attempt;
    const identity = this.#identity;
    if (!this.#tokens || !attempt || !identity)
      throw new AuthorizationRequired();
    const body = JSON.stringify({
      type: 'channel.chat.message',
      version: '1',
      condition: {
        broadcaster_user_id: identity.userId,
        user_id: identity.userId,
      },
      transport: { method: 'websocket', session_id: sessionId },
    });
    const send = () =>
      this.#request(
        'https://api.twitch.tv/helix/eventsub/subscriptions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.#tokens!.access}`,
            'Client-Id': this.#clientId!,
            'Content-Type': 'application/json',
          },
          body,
        },
        AbortSignal.any([attempt.signal, signal]),
      );
    let response = await send();
    if (response.status === 401) {
      try {
        await this.#refresh();
      } catch {
        if (this.#attempt === attempt) this.invalidate();
        throw new AuthorizationRequired();
      }
      if (attempt !== this.#attempt || signal.aborted)
        throw new AuthorizationRequired();
      response = await send();
    }
    if (response.status === 401 || response.status === 403)
      throw new AuthorizationRequired();
    if (response.status !== 202) throw new Error('Twitch subscription failed');
    const payload = await this.#body(response);
    const subscription = Array.isArray(payload.data)
      ? record(payload.data[0])
      : undefined;
    const transport = record(subscription?.transport);
    if (
      !text(subscription?.id) ||
      subscription.type !== 'channel.chat.message' ||
      transport?.method !== 'websocket' ||
      transport.session_id !== sessionId
    )
      throw new Error('Invalid Twitch subscription');
  }

  #clear() {
    this.#attempt?.abort();
    this.#attempt = undefined;
    clearTimeout(this.#validationTimer);
    this.#validationTimer = undefined;
    this.#tokens = undefined;
    this.#identity = undefined;
    this.#activation = undefined;
    this.#refreshing = undefined;
  }
}
