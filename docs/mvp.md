# Three-choice MVP

Accepted product scope: October 25, 2026. This is the target specification, not evidence of an
implemented or tested game. Current work is tracked in the [delivery plan](delivery-plan.md).

## Experience

One streamer plays against the collective Twitch chat in a normal Dice Chess game. The streamer
selects any legal sequence on the board. The audience chooses one of up to three complete turns
prepared by the engine for the chat side's single dice roll.

A complete turn can contain multiple micro-moves. Voting happens once per turn, not once per die
or piece. Legal maximum-dice use, castling, promotions, forced passes and king capture follow the
existing engine rules. A king capture ends the game immediately.

## One turn cycle

1. The streamer rolls once and plays a complete legal turn using board input.
2. The host rolls the chat's dice once and freezes the starting rule state.
3. The engine adapter returns up to three evaluated, distinct complete-turn candidates.
4. The host shuffles their display order once, assigns stable option numbers and previews them.
5. The main board returns to the unchanged starting state; the host opens a timed vote.
6. Valid audience commands update the current user's single vote and the displayed totals.
7. The host closes the round, resolves the result once and animates the winning complete turn.
8. Control returns to the streamer, or the game ends.

The streamer cannot regenerate candidates, alter the roll or manually replace a winning choice
inside an open poll. Operator controls may pause or extend voting; they do not choose for chat.

## Candidate quality

- A candidate is a **complete legal turn**, with the original rolled state and resulting state.
- Compare candidates using one documented evaluation basis. Scores from unrelated bots are not
  assumed interchangeable, and a score is not automatically a calibrated win probability.
- Retain a strongest-found candidate and prefer meaningfully different reasonable alternatives.
  This is a bounded search result, not a claim of mathematical optimality.
- Merge equivalent final rule states, including castling rights, en-passant state, side to move and
  remaining dice semantics. Mere reordering of independent moves must not fill multiple cards.
- Do not pad the set with deliberately bad moves. Quality/diversity policy is established from
  representative fixtures and recorded before claiming that all options are strong.
- If fewer meaningful alternatives exist, display fewer: zero legal paths forces a pass, and one
  candidate is visibly auto-played without a fabricated poll. Two candidates form a two-way poll.
- Freeze and shuffle display order once before preview. Never reveal an engine score or a
  best-choice badge during voting.
- Bound computation outside the UI thread. Measure representative opening, tactical and
  high-branching positions and define fallback behavior before freezing the implementation.

Three is the fixed MVP maximum. A fifth option is not part of acceptance for this deadline.

## Presentation

The OBS game scene contains a large board, rolled dice, side-to-move/status, up to three numbered
cards, a countdown, participant count, live vote totals and the selected result.

Each card shows a miniature of its final board state and a concise move/capture summary. A short
automatic preview demonstrates each actual sequence on the main board before voting opens.
Viewers need neither hover access nor a separate website. Operator-only controls are outside the
captured scene. Start with neutral option names; tactical/strategic labels require truthful data
and are optional.

## Voting contract

- Accept exact commands `!vote 1`, `!vote 2` and `!vote 3`, limited to displayed option numbers.
- Identify a voter by stable Twitch user ID. One equal-weight vote per user counts; the last valid
  command received before resolution replaces that user's previous choice in the open round.
- Use original event timestamps and event/message IDs to reject pre-open, post-close and duplicate
  messages. Pin the delivery cutoff/grace policy before implementation acceptance.
- Plain commands do not encode a round number, so a viewer who reacts to an old video frame can
  still send an ambiguous command during a new round. Document this limitation, show the round
  number, and do not claim timestamp checks can infer a viewer's intention.
- The host, not the capture browser, owns the deadline. Initially allow 30 seconds after previews;
  tune from real stream-delay evidence. Duration remains operator-configurable.
- Break ties randomly among tied leaders using reproducible recorded randomness, without ranking
  those leaders by hidden engine strength.
- With no votes, show a waiting state and allow extension. Never silently substitute a bot result.
- On a broken/revoked chat connection, pause. Reopen an interrupted vote with a new round ID and
  cleared votes on the **same board, dice and candidates** after health is restored. EventSub does
  not replay messages lost during an outage.
- A result and its move sequence execute exactly once. Late callbacks from an old round cannot
  change a new poll or apply a second turn.

## Essential operator controls

Start a game, play the streamer's legal moves, pause/resume, extend a vote and start a rematch.
Show Twitch connection health and restoration status. Persist the game across application restarts
without rerolling or duplicating moves. Restore an interrupted poll paused and reopen it explicitly.

## Completion evidence

The MVP is complete only after a clean-checkout run and a full real Twitch game with several
human viewers. Record readability and actual delay, forced/single/two-choice cases, vote changes,
ties, zero votes, duplicate/stale events, reconnect, restart, game completion and rematch.

The judging package needs an English description, verified setup instructions, an under-three-minute
demo showing Twitch operation and Codex development, the actual main Codex session ID and confirmed
repository access. Submission remains an owner action.

## Deferred

Five-choice mode, custom viewer-submitted moves, voting per micro-move, Channel Points/subscriber
weighting, tournaments, ratings, monetization, new voice/music packs, automatic commentary, native
Twitch Extensions and a hosted multi-channel service are outside this MVP.
