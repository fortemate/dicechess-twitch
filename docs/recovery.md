# Durable local session and recovery

Issue:
[fortemate/dicechess-twitch#8](https://github.com/fortemate/dicechess-twitch/issues/8).
The built CLI stores the current game and restores active play paused. Real
broadcaster consent/channel rehearsal remains separate live validation; the
local checks below do not establish a Twitch broadcast.

## Storage and authority

By default the host owns `.local/session.json` in its working directory.
`DICECHESS_STATE_FILE` may select a separate local checkpoint at launch. The
application does not load `.env` files. Browser tests always use an isolated
checkpoint, and programmatic `new Session()` remains memory-only unless given a
store. No disk path is exposed in OBS state.

The versioned, bounded checkpoint contains the board, original dice, active
side, current move prefix, complete current-game turn history, frozen ordered
choices, resolution/animation cursor, phase, on-air message, vote duration and
decision audit. It stores neither OAuth/activation material nor raw chat,
individual voter maps or engine score diagnostics. Authorization is still
host-memory-only and requires a new consent flow after process restart.

Each changed authoritative state is validated, written to a private temporary
file, flushed, atomically renamed and followed by a directory flush before
publication or the next move. Identical game checkpoints are not rewritten for
preview frames, countdown ticks or ordinary chat messages. Files use mode
`0600`; new parent directories use `0700`. The checkpoint limit is 2 MiB, with
at most 10,000 turns and 1,000 recent vote decisions.

One process holds `<checkpoint>.lock` with its PID and random ownership nonce. A
second live owner is rejected. A stale lock is reclaimed only when its recorded
process no longer exists; unknown ownership is preserved. Do not delete a live
lock to start a second host against the same game.

Loading rejects unsupported versions, extra fields, malformed positions,
inconsistent replay/history and invalid cursors instead of silently starting
over. The existing file is preserved. Stop the host and preserve the checkpoint
when investigating such an error. Starting a separate fresh game requires a
deliberate choice of another file or moving aside a backed-up checkpoint, not an
automatic deletion/recovery fallback.

## Restart behavior

The process session ID and operator capability are always fresh. OBS can
reconnect to the new host; the old operator page must reload and obtain new
authority. Old capabilities and commands cannot act on the restored game. The
game ID, committed position version, board, original roll and history remain
intact.

| Saved state                          | Recovery                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Idle/game over                       | Retain the stable state, winner/history and normal start/rematch controls.                                                                                               |
| Streamer roll                        | Pause; explicit resume permits one new roll.                                                                                                                             |
| Streamer preparation or partial turn | Pause; resume rebuilds the original complete legal tree and follows the saved prefix. No micro-move or roll is repeated.                                                 |
| Candidate preparation                | Resume the outstanding search on the same saved roll. No visible frozen choices are regenerated.                                                                         |
| Preview/voting                       | Retain exact choices/order/dice/board, discard partial votes and issue a new round ID. Resume validates retained complete turns and replays preview before a fresh poll. |
| Chat animation                       | Retain the resolved choice and next unplayed action. Resume validates the complete turn and applied prefix, then continues at that cursor.                               |
| Prepared forced pass while paused    | Commit the pass once on resume, without rerolling the passed turn.                                                                                                       |

An active game always requires explicit resume after restart. If it was using a
healthy Twitch connection, was already interrupted, or had an open poll, resume
also requires confirmed connection health. The previous partial vote map is
never restored. A local game that had never connected Twitch can continue its
local streamer/preview work without inventing a connection.

During normal connection loss the same policy invalidates an interrupted poll
immediately. Graceful EventSub handoff remains healthy. Manual pause inside a
running process retains accepted votes/time; process restart deliberately
discards them. Empty-poll extension remains an explicit operator action.

## Saving failure

A failed write rolls back the tentative transition to the last committed
checkpoint **before it is broadcast**, pauses play and displays a prominent
warning on both pages. No further move/auto-play timer can proceed. A roll or
move that was never durably committed is not presented as completed.

Only the operator can **Retry save**. A successful retry commits the recovered
paused state; it does not resume play. The operator then resumes explicitly,
with chat health required where applicable. An uncommitted poll decision is
discarded and its vote restarts; an already committed animation continues from
its saved cursor. Persistent corruption or an unavailable disk is not bypassed
by silently running an unsaved game.

## Local evidence

Node tests cover strict validation, actual filesystem permissions/replacement/
locking/corrupt-file preservation, partial-turn recovery, forced passes,
retained choices and round invalidation, animation cursors, terminal history,
fresh authority, disk failure/rollback and sanitized durable decision records.
Chromium checks cover disk restart on the same ports, OBS reconnect, operator
reload/old-capability rejection and visible save failure/retry controls.

The [process rehearsal report](measurements/recovery-local.json) records an
actual built-CLI SIGKILL/restart with public engine workers and real random
dice. It verified board/version/roll retention, stale-lock recovery, explicit
resume, old authority/session rejection, reroll rejection and one full history
entry after continuation. It used an isolated state file and disabled OAuth.
Real Twitch revocation/reconnect, OBS capture and a full broadcast rehearsal
remain owner/live verification, not evidence supplied by these tests.
