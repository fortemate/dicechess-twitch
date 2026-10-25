# Choices and broadcast presentation

Issue:
[fortemate/dicechess-twitch#7](https://github.com/fortemate/dicechess-twitch/issues/7).
The operator and OBS pages share host-owned preview frames, final-position
miniatures, move summaries and poll state. OBS is a read-only scene: no hover,
click or separate viewer website is required.

## Engine-approved previews

The host applies each frozen candidate's complete sequence using public engine
`applyMove`/`endTurn`. It verifies the exact resulting DFEN before presenting
the sequence. Every alternative starts at the original rolled position, shows
each micro-move, then its final position. Frames advance every 900 ms; three
three-action choices take 13.5 seconds. Castling, capture, en passant, promotion
and terminal king capture use the engine's actual results. Descriptions derive
from before/after boards, including a pawn removed by en passant.

The main board is explicitly captioned **Preview only** while showing a frame;
the action's source/destination are highlighted. Every numbered miniature always
shows its final outcome. Visible summaries identify captures and promotion
pieces. Cards have no scores, quality ordering or best-choice label; they keep
the candidate adapter's once-shuffled option order.

Preview frames are a separate presentation state. They never change game DFEN,
position version, dice, candidate order or execution cursor. When every option
has been shown, the host restores the true starting board. Only then may a
healthy Twitch connection open voting. A single retained choice is also
previewed completely before its explained automatic execution; it has no vote
command. A forced pass has no fabricated miniature or poll.

Pause stops the frame timer and preserves the displayed frame. Resume repeats
that frame's normal interval before continuing. An invalidated round discards
its preview and starts again with the retained choices. Browser reloads join the
current host frame without restarting its timeline. A process restart instead
restores the game paused and replays preview from the root after resume; the
board, roll and ordered choices stay committed. A preview validation failure
pauses gameplay and offers retry, rather than displaying an invented outcome.

## Scene and state

The streamer color determines orientation consistently on the main board and all
miniatures. The scene identifies streamer/chat turn, connection health,
preview/poll state, remaining time and participant count. A chosen card is
highlighted during execution; the last-turn summary retains its option number
after control returns to the streamer. Operator actions remain on the separate
listener and never appear in the OBS DOM or routes.

The scene targets 1920×1080 with three visible cards; the layout is also checked
at 1280×720. Shorter-view adjustments keep status/connection/footer inside the
viewport. Long promotion summaries have their own layout fixture. Chess glyphs
come from system fonts, as described in [provenance](provenance.md).

## Evidence and remaining validation

`npm run check` verifies special-move descriptions, exact final states,
per-choice starting-board reset and host state isolation, including pause and
single-choice timing. `npm run test:browser` checks all three miniatures against
engine results, no scores/operator controls, both documented sizes and no page
overflow. Local screenshots are saved under `test-results/`.

These are Chromium and synthetic-position checks. Actual OBS capture,
compressed-stream readability and real Twitch audience use remain broadcast
rehearsal work; no live transmission is claimed.
