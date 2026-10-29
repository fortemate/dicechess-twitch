# Installed Twitch connection

Issue:
[fortemate/dicechess-twitch#5](https://github.com/fortemate/dicechess-twitch/issues/5).
OAuth/EventSub code and local fixture checks are implemented. Owner onboarding
has verified a real broadcaster authorization, receipt of real chat messages and
one owner-operated chat vote that executed the selected complete legal turn.
**An independent-viewer full game and broadcast rehearsal remain unverified.**
Keep the issue open until its remaining acceptance checks are recorded.

## Owner setup and real verification

1. Register a separate application in the
   [Twitch developer console](https://dev.twitch.tv/console/apps) using the
   [official registration instructions](https://dev.twitch.tv/docs/authentication/register-app/).
   Choose the public client type for this installed application. Its Client ID
   is public; this application does not request a client secret.
2. Start the host with that public ID (replace the placeholder):

   ```sh
   TWITCH_CLIENT_ID='<public-client-id>' mise exec -- npm run dev
   ```

3. Open `http://127.0.0.1:4310/` and click **Connect Twitch**. The operator page
   shows an activation code/link. The broadcaster personally signs in and
   approves access on Twitch. Neither an agent nor the OBS page performs that
   consent.
4. Confirm the displayed account is the intended broadcaster and the state
   becomes connected. Send a few messages in that channel. The operator's
   received-message count should increase. Follow [voting](voting.md) to test
   actual commands after preview opens a poll; ordinary messages do not vote.
5. Verify the OBS page has connection health but no activation code/link,
   credential, operator endpoint or mutating control. Record actual connection
   loss/recovery and revocation behavior before calling integration verified.
6. **Disconnect Twitch** closes the local connection and clears active host
   authorization state. It does not remove the account's grant from Twitch's
   Connections settings. A host restart requires a fresh authorization; no
   tokens are persisted by this implementation. The
   [game checkpoint](recovery.md) is independent and restores the
   board/roll/choices paused.

No OAuth action occurs on startup or without the operator's Connect command.
With no Client ID, local board/candidate work remains available and Twitch is
explicitly not configured. The scaffold does not load `.env` files; the public
ID comes from the launch environment.

The installed-broadcaster flow requests only `user:read:chat`; it never sends
chat messages or requests write/bot/moderation permissions. Its authenticated
user is also the subscribed broadcaster. See
[installed chatbot permissions](https://dev.twitch.tv/docs/chat/authenticating/).

The validated activation link explicitly selects `public=true`, as shown in
Twitch's device-flow documentation. Some device responses omit this parameter;
the generic activation page can reject a matching code. Use the current link
from the operator page rather than an older activation tab. If the attempt has
ended, reconnect to obtain a fresh code. Activation material must not be saved
in screenshots or troubleshooting logs.

## Authorization boundary

The host uses Twitch's
[public-client device grant](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow).
Only an activation user-code and validated Twitch activation URL reach the
operator-only `/api/operator/twitch` endpoint. Device, access and refresh tokens
stay in host memory. They never enter URLs, browser storage, operator snapshots,
OBS state or logs. The bearer is attached only inside the host's fixed Twitch
API methods. HTTP redirects are refused; provider error text is not copied into
application errors.

The host [validates](https://dev.twitch.tv/docs/authentication/validate-tokens/)
the client, user, expiry and required scope before connecting and hourly
thereafter. HTTP 401 triggers one serialized
[refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/) attempt,
retaining rotated single-use refresh credentials. Revoked/failed authorization
stops the connection and requires consent again. These paths are fixture-tested;
their real public-client setup remains owner verification.

## EventSub and game health

The transport uses Node's native WebSocket and one `channel.chat.message`
subscription. The first welcome creates it once; duplicate welcomes do not
create duplicates. Chat callbacks retain stable broadcaster/user/message/event
IDs, original RFC3339 timestamp including nanoseconds, host receipt time and
text. Raw chat is not logged or broadcast. Duplicate event/chat IDs are bounded
by a ten-minute, 10,000-message cache; malformed and foreign-channel
notifications are ignored.

Following the
[WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/),
keepalive/notifications reset the timeout; native WebSocket handles protocol
ping/pong. A graceful reconnect keeps the old socket until the new welcome and
transfers subscriptions without another POST. Actual loss closes stale sockets,
retries with capped backoff and subscribes on a fresh session. Only validated
official Twitch reconnect destinations are accepted, passed unchanged.

The silence watchdog allows 20% timing jitter, capped at five extra seconds,
after the advertised keepalive interval. This avoids racing a message sent at
that boundary; sustained silence still marks the transport unhealthy and pauses
the game. The local host prints fixed interruption categories such as
`keepalive-timeout` or `socket-error` for diagnosis, never raw frames,
identifiers, chat content, authorization URLs or provider error text. This
tolerance is fixture-tested. An initial idle observation and one owner-operated
real vote completed after this change; prolonged network stability still needs
verification.

Graceful handoff remains healthy. Actual loss/revocation pauses an active game.
An interrupted preview/vote receives a new round ID while retaining the exact
board, original dice and choice order. Old resolution callbacks are rejected.
Connection recovery does not resume gameplay automatically; the operator must
explicitly resume after health returns. The [vote coordinator](voting.md)
discards the interrupted vote map/timer and opens a fresh poll after preview.

## Local evidence and remaining work

Run `npm run check` and `npm run test:browser`. Tests use explicit fake HTTP
responses and socket ports with fixture credentials; they never authorize a real
account. They cover permission minimization, pending/expired grants, hourly
validation, serialized 401 refresh, malformed input, deduplication,
welcome/keepalive/handoff/loss/revocation, session callbacks, interrupted-round
identity and browser separation of activation versus OBS health.

The production path has no fake-event command or UI. The tests are not a
substitute for registering the app, broadcaster consent, real chat events or the
full-game broadcast rehearsal. Live evidence for Issue #5 and the complete
broadcast rehearsal remain unfinished.
