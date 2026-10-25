# Proposed MVP architecture

Status: local transport, streamer gameplay, candidate preparation and game transition hooks
implemented October 25, 2026. OAuth/EventSub code is locally fixture-tested; real Twitch
verification remains follow-up work; [durable checkpoints/recovery](recovery.md) are implemented. [Host-owned previews](presentation.md)
show approved sequences/final boards without changing game state. Host-owned
[voting](voting.md) now counts normalized chat events and resolves full turns. The [MVP contract](mvp.md) is accepted.
See [development](development.md) for verified commands and current limitations.

## Implemented scaffold

One Node.js process binds two loopback listeners: operator on `127.0.0.1:4310`, read-only OBS on
`127.0.0.1:4311`. Separate client bundles receive the same initial and updated public snapshot via
SSE. Snapshot projection includes session ID, display/control revisions, timestamp, on-air message, an explicit
sanitized Twitch health, vote totals/deadlines and a [public game projection](game-state.md). Legal action controls,
engine scores and operator configuration stay outside that projection.

Only the operator listener exposes bootstrap/command routes. Bootstrap requires a custom request
header; mutation requires the operator origin, an in-memory capability and the current session
ID/control revision. Host checks reject DNS rebinding; neither listener enables CORS. OBS has no operator
assets/routes, and its CSP restricts connections to its own origin. This is a local browser boundary,
not authentication against other software/users on the machine. Do not expose the listeners publicly.

Display `revision` orders every SSE update, including chat counters, vote totals, countdowns and
preview frames. Commands send `expectedRevision: snapshot.controlRevision`; operator game controls
use that same counter. It advances on game, poll-phase, settings, connection or storage changes and
every accepted command, including unchanged settings. Display-only traffic keeps controls valid.
The private Twitch activation DTO retains display ordering because activation can change while
board controls stay valid. Stale/repeated commands return 409. SSE reconnect returns the latest snapshot. A host restart creates a fresh session and
capability; the operator must reload. A validated checkpoint restores the committed game paused,
including the original roll, frozen choices and next unplayed animation action. Lost poll votes
are discarded under a new round ID; OAuth material is never persisted.

## Local application

Use a TypeScript browser interface and a local Node.js host for one channel and one game session.
Reuse suitable public browser UI code only after checking licensing and extraction cost. Keep an
operator page separate from a read-only scene captured by OBS. No public application hosting is
required for this installed-application MVP.

The local host owns the board, original dice roll, turn history, candidate set, poll deadlines,
vote map and resolution. Browser views render snapshots; they do not independently roll dice,
count down to resolution or apply moves. Restrict mutating controls to the operator session.

Implemented states include streamer roll/preparing/turn, chat roll/preparing, preview, voting,
resolving, chat animation, paused and game over. Voting uses normalized EventSub events, host timers, equal votes with changes, reproducible ties
and an explicit zero-grace policy. Multiple chat choices wait for a healthy connection, then open
a poll after preview completes and restores the original board. Local end-to-end checks use explicit Twitch fixtures. Every asynchronous result is scoped to its original job/session/position/
round; resolution marks the round before animation and rejects repeat callbacks.

## Engine boundary

The public engine owns legal rules and search. Its JS API exposes `getLegalTurnTree` and
`getBestMove`; the current public declaration returns one best sequence, not a ranked top-three
list. The [candidate adapter](candidate-generation.md) now walks that frozen tree, deduplicates
rule states, includes the public greedy-v2 suggestion, evaluates a bounded diverse sample with
the same public equity estimator, retains the strongest sampled result and freezes up to three
numbered options in the parent thread. It runs in a terminable Node worker; no upstream change
or engine release is needed. Local measurements and limits are recorded in the adapter document.

Candidate results should carry the original position version, complete micro-move sequence,
resulting rule state and a comparable internal score/quality basis. Deduplicate before display and
freeze the final set. Use a worker so expensive search cannot stop chat handling or the UI. Keep
private production tuning, models and opening books outside the project.

Validate streamer sequences by walking the legal turn tree generated from the original rolled
position. Repeated isolated `getLegalUciMoves` calls can admit sequences that violate whole-turn
maximum-dice rules. Preview snapshots must not mutate the authoritative game.

## Twitch boundary

The [installed connection](twitch-connection.md) now implements a public-client device grant,
startup/hourly validation, refresh and EventSub lifecycle with host-only authorization material.
Operator activation details are separate from the public connection-health projection. Local
fixtures cover these paths; actual broadcaster consent and real-channel evidence are still pending.

Use the installed-chatbot flow with broadcaster authorization and EventSub WebSocket reception for
`channel.chat.message`. Twitch recommends WebSocket transport for locally installed applications;
it avoids a public webhook endpoint. Request only the permissions needed by implemented features.

Separate the event adapter from the pure vote reducer. Carry stable user ID, original event timestamp,
message ID and message text. Deduplicate deliveries, reject invalid time windows and bind votes to
the current round. A fake event source is useful for tests but cannot count as Twitch verification.

Connection health is a session input. Twitch distinguishes graceful reconnect from a lost connection;
lost events are not replayed after an outage. Invalidate interrupted polls and reopen with cleared
votes/new round IDs while preserving the board, roll and candidates. Never merge an apparently
complete result from a period in which chat was disconnected.

## Persistence and evidence

Persist authoritative transitions, including dice, candidates and resolution state. Restarts restore
the exact game; an interrupted poll comes back paused. Keep sufficient round/result data to explain
a tie and diagnose duplicate execution, without retaining unnecessary chat content.

Fresh-checkout setup, meaningful reducer/state-machine tests, real Twitch rehearsal and OBS
readability evidence are required before the application is called ready. Precise runtime/tool
versions and executable check commands belong in the bootstrap implementation, not speculative docs.

## Sources

- [Engine JS declaration](https://github.com/fortemate/dicechess-engine/blob/main/js/dicechess-engine.d.ts)
- [Twitch chat](https://dev.twitch.tv/docs/chat/)
- [Twitch authorization and EventSub setup](https://dev.twitch.tv/docs/chat/authenticating/)
- [EventSub WebSocket behavior](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)
