# Real broadcast rehearsal

Issue:
[fortemate/dicechess-twitch#9](https://github.com/fortemate/dicechess-twitch/issues/9).
**Preparation only. No real broadcaster consent, human-viewer game or OBS/Twitch
broadcast has been recorded by this work.** Local automated checks and the
process restart report are separate evidence.

## Start with a reviewed build

Record the exact commit, date/time/timezone, machine/OS and Node/npm versions in
[the report template](rehearsal-report-template.md). Review the open PR stack
before choosing a tested revision; `main` does not yet contain the application.
Until merge, a fresh checkout can select `test/full-game-rehearsal`, which also
contains the operator and multiple-en-passant checkpoint fixes.

Follow [development](development.md): pinned runtime, `npm ci`, `npm run check`,
Chromium installation and `npm run test:browser`. A clean checkout needs the
public npm engine, not another Fortemate repository or private registry. Local
evidence currently covers macOS; Linux CI checks the same suite. Windows
filesystem/font behavior has not been validated.

For the real session, use `npm run dev` or the documented built start. The
broadcaster registers the public Twitch client and personally approves the
[installed connection](twitch-connection.md). Check that the connected channel
is the intended account. Add `http://127.0.0.1:4311/` as a 1920×1080 OBS Browser
Source. Capture only that read-only surface; keep authorization and operator
controls off the stream.

The owner arranges the rehearsal and invites consenting human viewers. Nothing
in this preparation sends invitations, starts a stream, grants account access or
publishes footage. Record actual human/account counts; several accounts
controlled by one tester do not establish several independent participants.
Record only consent-appropriate handles/aliases and evidence links. Keep raw
working notes in gitignored local files and sanitize any committed summary.

## Live sequence

1. **Transport:** send an ordinary message in the real channel. Confirm the
   operator counter changes and OBS shows connected health, without an
   activation code or private control. This proves transport, not voting.
2. **Streamer freedom:** start with the intended streamer color, roll once and
   choose a complete legal turn. Show the piece/destination interaction; a
   second roll must be unavailable during that turn.
3. **Choices:** wait for a natural multi-choice chat round. Confirm each final
   board matches its preview and that the main board returns to the original
   position before voting. A round may honestly have fewer than three choices;
   do not pad or reroll to manufacture three strong options.
4. **Voting:** have two independent viewers choose different valid options. One
   viewer changes their vote before the deadline. The participant total should
   remain unchanged for that replacement; everyone has equal weight. Send an
   invalid/nonexistent option and normal chat; neither adds a voter.
5. **Deadline/result:** compare the live overlay counts with the intended
   choices and note the selected option. Check one complete execution and return
   to the streamer. For a tie, retain the host's decision audit rather than
   claiming that a particular random outcome was expected.
6. **Empty poll:** agree that nobody votes in one round. The board must stay
   fixed and waiting must be visible. The operator extends it; fresh valid votes
   may then decide it. There must be no silent bot decision.
7. **Complete a real game:** continue to king capture and rematch. Record the
   actual result and evidence. A synthetic king-capture fixture cannot replace
   the full human-vote game.

## Delay and interruptions

Measure the host poll opening from `/api/snapshot` and the time a remote viewer
sees the opening on the stream, using synchronized clocks. Record latency mode,
player size/quality, approximate delay and whether the default 30-second vote
window was usable. Evaluate all three cards at 1080p and in the actual smaller
player, including moving pieces, captures/promotions and selected outcome.

Admission has [zero delivery grace](voting.md): source timestamp, host receipt
and processing must fall inside the open window. Untagged `!vote N` commands
cannot reveal a delayed viewer's intended round. Observe that limitation; do not
report stale delivery and human intent as the same thing. If evidence supports a
longer countdown, change it between rounds in the operator page and record the
setting/result. No unsupported timing improvement is claimed.

Exercise manual pause/resume during preview, voting and execution. Check that
the board, roll and choices stay fixed and resume cannot execute a sequence
twice. Reload only OBS and confirm it rejoins without changing the host timer.

In a deliberate failure-test window, interrupt the host's network and restore
it; note any effect on the stream itself. The active round must pause, clear
partial votes and restart with a new ID and the same choices after confirmed
healthy connection and explicit resume. Separately revoke the application's
grant in Twitch account settings and verify reauthorization is required. The
owner performs account/network actions; this runbook does not execute them.

Restart the host during a partial streamer turn and during chat animation.
Follow [recovery](recovery.md): no repeated roll/move, fresh local authority,
cleared interrupted poll and explicit resume. Stop if saving fails; use the
operator retry path instead of continuing unsaved play. Keep a checkpoint copy
before deliberate restart tests.

Duplicate/stale envelope injection is already checked in isolated tests. Record
real duplicate delivery only if observed; mark it not reproduced in the live
session otherwise. Do not fabricate a Twitch outage, tie or duplicate as
recorded platform behavior.

## Rare cases in a separate fixture session

The explicit test harness uses synthetic positions, fixed dice, real public
engine workers, no Twitch configuration and no saved production game:

```sh
mise exec -- npm run rehearse:fixtures -- forced-pass
```

Open operator `http://127.0.0.1:4410/` and read-only fixture scene
`http://127.0.0.1:4411/`. Both show the fixture message; the operator note and
terminal state that it is non-production. Do not replace that notice or present
this footage as a real channel. Ctrl-C closes the fixture listeners. It does not
read the default checkpoint or authorize Twitch, even if normal launch variables
exist in the shell.

| Argument        | Start as | Check                                                                                                   |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `forced-pass`   | White    | Roll: no legal pawn action; explicit forced-pass summary and no fabricated poll.                        |
| `single-choice` | Black    | Chat previews the sole retained turn, explains automatic play and executes once without a vote command. |
| `king-capture`  | White    | Roll and play queen e7–e8; king capture ends immediately and rematch is available.                      |
| `promotion`     | White    | Roll and choose a7–a8; all legal promotion pieces are offered and the result is visible.                |
| `castling`      | White    | Roll and select e1–g1 or e1–c1; both king/rook effects come from the engine.                            |

These fixtures cover rare mechanics and capture checks. They are not a
replacement for the real multi-account game, live timing or connection tests.

## Headless complete-game regression

Before arranging human viewers, run the opt-in starting-position check:

```sh
mise exec -- npm run rehearse:full-game
```

It plays two isolated games, one per streamer color, using the pinned public
engine for legal trees and actual ranked chat candidates. A fixture driver
chooses legal streamer actions; fake OAuth/EventSub and three synthetic numeric
user IDs exercise voting, replacements and duplicate delivery. Every operator
command is repeated to verify rejection. Each authoritative transition passes
through a real, isolated FileStore. No HTTP/OBS listener, real account, Twitch
network call or production checkpoint is used, regardless of normal launch
environment variables.

Node test timers accelerate preview, voting and animation; worker searches use
real time and their watchdog is advanced by elapsed real search time. This does
not measure real stream delay, wall-clock poll delivery, OBS readability or
human interaction. Dice streams have fixed fixture seeds, but engine
tie-breaking and poll seeds can change the resulting game. A seed is not an
exact game replay.

The terminal prints a unique `.local/rehearsals/full-game-*` evidence directory.
It retains per-color reports and checkpoints/history, including revision, dirty
tracked-worktree flag, runtime, winner, turn/poll counts and elapsed time. A
pause, save error, absent poll, more than 240 turns or four minutes per game
fails the check; failure reports are retained. The runner always disposes its
sessions. It is outside the ordinary CI unit-test glob and is a local rehearsal,
not evidence that Issue #9's real-human Definition of Done is complete.

## Review outcome

Fill each report row with observed evidence or **not run**, never a default
pass. Link actual blocking defects to deduplicated GitHub issues and retest
fixes on an identified revision. Keep Issue #9 open until the live Definition of
Done is met. The judging package stays unfinished until the owner has reviewed
the real footage, access and limitations.
