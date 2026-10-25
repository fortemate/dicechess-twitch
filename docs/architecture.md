# Proposed MVP architecture

Status: local transport scaffold and a standalone candidate adapter implemented October 25, 2026;
the game, Twitch, voting and persistence sections below remain proposals. The [MVP contract](mvp.md) is accepted.
See [development](development.md) for verified commands and current limitations.

## Implemented scaffold

One Node.js process binds two loopback listeners: operator on `127.0.0.1:4310`, read-only OBS on
`127.0.0.1:4311`. Separate client bundles receive the same initial and updated public snapshot via
SSE. Snapshot projection includes only session ID, revision, timestamp, setup/paused status,
on-air message and an explicit not-connected integration marker. No game state is simulated.

Only the operator listener exposes bootstrap/command routes. Bootstrap requires a custom request
header; mutation requires the operator origin, an in-memory capability and the current session
ID/revision. Host checks reject DNS rebinding; neither listener enables CORS. OBS has no operator
assets/routes, and its CSP restricts connections to its own origin. This is a local browser boundary,
not authentication against other software/users on the machine. Do not expose the listeners publicly.

Commands commit synchronously in the host and broadcast one new revision. Stale/repeated commands
return 409. SSE reconnect returns the latest snapshot. A host restart creates a fresh session and
capability; the operator must reload. Durable recovery and game resolution remain separate work.

## Local application

Use a TypeScript browser interface and a local Node.js host for one channel and one game session.
Reuse suitable public browser UI code only after checking licensing and extraction cost. Keep an
operator page separate from a read-only scene captured by OBS. No public application hosting is
required for this installed-application MVP.

The local host owns the board, original dice roll, turn history, candidate set, poll deadlines,
vote map and resolution. Browser views render snapshots; they do not independently roll dice,
count down to resolution or apply moves. Restrict mutating controls to the operator session.

The proposed high-level states are streamer turn, chat roll/preparing, preview, voting, resolving,
chat animation, paused and game over. Every asynchronous result is bound to session ID, position
version and round ID. Resolution is idempotent.

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
