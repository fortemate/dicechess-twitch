# Authoritative local game

Issue:
[fortemate/dicechess-twitch#4](https://github.com/fortemate/dicechess-twitch/issues/4).
The operator can start as either color, roll once, play any complete legal
streamer turn through the board, pause/resume and rematch after game over. The
host rolls for chat and prepares frozen engine choices. The
[vote coordinator](voting.md) now opens/closes healthy polls and submits their
winning full turn. The separate [preview timeline](presentation.md) shows each
choice and restores the original board before polling without changing game
state.

The [OAuth/EventSub connection](twitch-connection.md) supplies host-only events
and sanitized health, with real-channel verification still pending.

## State and ownership

`Game` owns the DFEN, original rolled DFEN, current legal-tree node/prefix,
candidate set, round ID, animation cursor, resolved-round guard and timers.
`Session` owns the process session ID, display/control revisions and on-air
message. Every accepted command or asynchronous game transition publishes a new
display revision. The control revision advances for meaningful operator state
changes and every accepted command; chat counters, vote totals, preview frames
and countdown ticks do not advance it. The browser renders; it never rolls,
searches, validates rules or decides that a turn has completed.

| Phase                          | Allowed progression                                                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`                         | Start with streamer color.                                                                                                                                                                                |
| `streamer-roll`                | Operator rolls exactly once.                                                                                                                                                                              |
| `streamer-preparing`           | Worker builds the original complete legal turn tree.                                                                                                                                                      |
| `streamer-turn`                | Board input follows only children of the retained tree node. A leaf completes the turn; king capture ends the game immediately.                                                                           |
| `chat-roll` / `chat-preparing` | Host rolls once and submits a scoped candidate job.                                                                                                                                                       |
| `preview`                      | Original board remains unchanged; choices are frozen. One retained choice is fully previewed and explained before auto-play. Multiple choices open a poll after completed preview when Twitch is healthy. |
| `voting`                       | Host-owned vote collection/resolution; no operator winner-selection command.                                                                                                                              |
| `resolving` / `chat-animation` | Mark the round resolved before scheduling moves. Apply each action once and end the turn, or stop immediately on king capture.                                                                            |
| `paused`                       | Reject moves/rolls/resolution. Stop auto-play/animation timers. Completed preparation can be retained for resume.                                                                                         |
| `game-over`                    | Show winner by king capture; rematch creates a fresh game ID.                                                                                                                                             |

The MVP uses king capture as the terminal condition. It does not introduce
checkmate/stalemate or a counter-based automatic draw. No legal move for the
current dice is an explicit forced pass. The last-turn summary retains the
explanation even after control passes to the next side.

## Rules, dice and asynchronous work

The production dice source uses three independent `crypto.randomInt(1, 7)`
faces. Piece mapping comes from the public engine. Phase guards prevent a second
roll, a roll during preview/voting, or an operator-supplied dice pool. No public
command sets a DFEN, changes a roll or chooses a chat winner.

Streamer legality comes from `getLegalTurnTree` in a separate Node worker with a
five-second timeout and bounded heap. The host keeps that original tree,
advancing its node after each micro-move; it never rebuilds legality in the
middle of the turn. Promotions and two-die castling are engine actions, not
special independently validated client rules. Applying one already validated
micro-move and `endTurn` uses the public rules package in the host.

Chat preparation uses the [candidate adapter](candidate-generation.md).
Request/result identity includes session ID, position version, round ID and the
frozen rolled DFEN. Current job identity and abort state reject obsolete
callbacks. Game IDs change on rematch; position versions stay monotonic within
the process session. Search failure pauses and resume retries the same roll,
before a poll has opened. Ordinary pause/resume never regenerates frozen choices
or rerolls dice.

Before resolution, verify the chosen sequence's resulting DFEN against the
unchanged rolled board. The candidate module has already proved the path is a
complete leaf of the original tree. Mark the round as resolved before the
animation starts. Duplicate resolution callbacks, repeated clicks and old round
IDs cannot apply another turn. Pausing an animation preserves its next unplayed
action; resume continues from that cursor.

## Operator and broadcast boundary

Operator HTTP commands are `start`, `roll`, `move`, `pause`, `resume`, `rematch`
and `set-message`, all scoped to the latest session/`controlRevision`. Commands
require the existing operator-origin/capability boundary. Legal action names and
control availability come from the operator-only `GET /api/operator/state`,
which requires the same-origin custom header. Neither this endpoint nor operator
assets exist on the OBS listener.

Public snapshots explicitly project board/roll, phase, position/round IDs,
winner, last turn and numbered candidate sequences/resulting boards. They do not
contain the legal tree, legal-action controls, evaluation scores, private
configuration or authority. The main OBS board has 64 noninteractive cells, with
up to three read-only miniatures; OBS has no form or button. The operator may
click any legal continuation; it cannot replace a future chat-vote result.

The internal `openVoting`/`resolveChoice` hooks are deliberately not operator
HTTP commands. Their behavior is tested with local orchestration fixtures.
Without a healthy Twitch connection, multiple choices remain at preview.
Normalized fixture chat verifies end-to-end voting/execution; real broadcaster
chat is still unverified. [Durable recovery](recovery.md) restores committed
game state paused, rebuilds the original maximal tree for a partial streamer
turn and validates retained choices/animation prefixes before continuation. The
saved current-game history records each completed turn once. A fresh process
session requires operator reload; interrupted polls reopen under a new round.

## Verification

Run `npm run check` and `npm run test:browser` with the pinned runtime. State
tests cover maximal-tree continuation, once-only rolls, promotion/castling,
paused preparation, forced/single choices, duplicate resolution through
animation/pause, king capture/rematch, stale preparation and disposal.

Chromium tests use controlled dice and explicit synthetic positions while
running the real public engine workers. They select a full pawn/knight/queen
turn, receive chat choices on both surfaces, and exercise promotion and castling
from board clicks. Fixtures verify orchestration and browser input; they do not
establish real Twitch, human-viewer or actual OBS capture evidence.
