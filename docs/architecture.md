# Proposed MVP architecture

Status: implementation proposal selected for the first spike, October 25, 2026. No runtime or
integration is implemented yet. The [MVP contract](mvp.md) is accepted; technology details can be
adjusted in the bootstrap issue if a measured integration constraint requires it.

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
list. Live public source was checked on October 25, 2026. The first candidate spike must choose an
adapter approach and measure it; exposing a small upstream scored-candidate API is an option,
not an existing capability or authorization to publish an engine release.

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
