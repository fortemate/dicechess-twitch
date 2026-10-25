# Host-owned chat voting

Issue:
[fortemate/dicechess-twitch#6](https://github.com/fortemate/dicechess-twitch/issues/6).
Code is tested with real engine moves and explicit OAuth/EventSub fixtures.
Actual broadcaster/channel rehearsal is still required by
[the Twitch connection guide](twitch-connection.md) and the broadcast issue.

## Opening and controls

Two or three frozen choices enter a pre-vote review hold. The current host hold
is 4.5 seconds; animated per-choice presentation remains Issue #7. A poll opens
only when this hold completes and Twitch is healthy. Candidate order, original
dice and board do not change. Single choices and forced passes use the game's
explained automatic paths without manufacturing a poll.

Default duration is 30 seconds. The operator may set an integer from 5 to 120
seconds before preview; it cannot be edited during preview, voting or pause. The
host owns the absolute deadline, counts and resolution timer. Both pages receive
the same totals and remaining time, updated at least once per second while open.
Reloading a browser does not open or extend a poll.

Only exact `!vote 1`, `!vote 2` and `!vote 3` commands are accepted (case
insensitive, surrounding whitespace ignored). The option must exist in this
round. There is one equal-weight vote per numeric Twitch user ID. A later valid
vote replaces the user's previous choice. No subscriber, moderator, broadcaster,
paid or bot role changes its weight.

## Timestamp and delivery policy

Every admission requires the current round, an open healthy game and valid
user/message/event identities. Both EventSub's original notification timestamp
and host receipt time must be inside the current half-open window
`[openedAt, closesAt)`, and the host must process the message before the
deadline. **Delivery grace is zero.** A message sent before opening, received
after closing, or processed after the host deadline cannot alter a result. All
nine RFC3339 fractional digits are retained for boundary comparisons; the host
clock has millisecond resolution. Source times beyond the host's current
millisecond are rejected. Large clock skew can therefore reject votes; the
broadcast rehearsal must check that the host clock is synchronized.

For out-of-order delivery, "last" means the latest original source timestamp,
not the last network callback. At exactly equal nanosecond timestamps, the
lexicographically greater message ID wins deterministically. Event and chat
message IDs are each deduplicated. Per-round admission is bounded at 100,000
valid messages; further messages fail closed. Counts update in constant time,
and snapshots contain only at most three totals, never voter IDs or raw chat.

Untagged commands cannot express the sender's intended round. A person watching
a delayed stream may send `!vote 2` during a newer round's actual window; the
host cannot distinguish that from a vote for the newer round. Timestamp guards
reject delayed delivery from an older window, but cannot remove this human
intent ambiguity. This limitation is explicit; no false round guarantee is
claimed. A future protocol could require a round-specific command.

## Closing, empty polls and recovery

A nonempty poll selects the highest vote count. Ties draw only among tied
leaders, sorted by option number, using a host-generated random seed and a
deterministic Mulberry32 draw with rejection sampling. A decision records the
round, closing deadline, all counts, leaders, seed, selected index and winner.
Reapplying the recorded algorithm reproduces the selection without any engine
quality preference. Decisions currently live in bounded host memory and the
latest public snapshot; durable storage is Issue #8, so restart loses this log.

The poll is marked resolved before the full turn is submitted to `Game`. Game's
independent round/position/result validation and resolved-round guard reject
duplicate callbacks. Its animation applies the winning complete turn once and
returns control to the streamer, or ends on king capture. There is no operator
HTTP action to pick a winning chat option.

With zero votes the board stays unchanged and both pages show waiting. Only the
operator can **Extend empty vote**, which opens a fresh window for the same
ordered choices and configured duration. Waiting does not silently start a bot
turn or count late messages.

Manual pause preserves admitted votes and remaining duration. Resume opens a new
delivery window with that remaining duration; messages from the pause gap or
earlier window are rejected, while already admitted votes remain. Actual Twitch
loss invalidates the round instead: old votes/timers are discarded,
choices/dice/board stay fixed, and recovery requires explicit operator resume
followed by preview and a fresh poll. Graceful socket handoff stays healthy.

## Local evidence

`npm run check` covers source chronology, duplicate IDs, command/identity and
nanosecond bounds, deadline/grace behavior, equal weights, pause/extension,
deterministic ties and normalized fixture chat through the actual session/game.
`npm run test:browser` covers empty-wait/extension controls, read-only OBS,
changed/duplicate votes and one complete turn on both pages. OAuth/socket
fixtures do not establish real Twitch chat or broadcast evidence.
