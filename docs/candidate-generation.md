# Complete-turn candidate adapter

Issue:
[fortemate/dicechess-twitch#3](https://github.com/fortemate/dicechess-twitch/issues/3).
This host-side adapter is used by the local game machine to prepare frozen chat
choices. The [vote coordinator](voting.md) consumes these frozen choices; real
Twitch channel verification remains pending.

## Integration decision

Use only the existing public `@fortemate/dicechess-engine@0.14.9` APIs:
`getLegalTurnTree`, `applyMove`, `endTurn`, `getBestMove`, `canonicalKey` (input
validation only), and `estimateEquity`. No upstream contract change or engine
release is required. The package exports one best sequence, not a ranked list.
The adapter supplies collection, deduplication, bounded sampling, a shared
evaluation policy, diversity selection and frozen display order.

The engine's `greedy-v2` suggestion is visited first in the original legal tree
and included in the sample. Its numeric score is discarded. Every sampled
nonterminal result is evaluated by `estimateEquity` with the same request seed,
rollout count and horizon. The common utility is:

```text
utility = estimated mover-win mass + 0.5 × undecided survival mass
terminal king capture = 1
```

This is a short-horizon random-play estimate with unresolved games valued at one
half. It is **not** a calibrated win probability, a strength guarantee or an
optimal search. The engine's unseeded tie-breaking can change its initial
suggestion across runs; a seed alone cannot reconstruct a completed set. Persist
the actual frozen candidates, not just the seed, during later recovery work. No
score from another bot is mixed with this scale.

## Legality and identity

Walk `getLegalTurnTree` from the original rolled DFEN all the way to a leaf.
Never regenerate `getLegalUciMoves` after an action: this can admit turns that
violate maximum dice consumption. The engine handles rook+king dice for
castling, promotions and en-passant captures. The adapter applies UCI actions
with `applyMove` and calls `endTurn` once for nonterminal leaves. King capture
ends immediately without `endTurn`, preserving the terminal mover and leftover
dice in the representative DFEN.

Deduplication keeps board orientation, active color, castling rights, en-passant
targets and sorted remaining dice. Half/full-move counters are kept in the
representative DFEN but excluded from the key: this king-capture MVP does not
implement a counter-based automatic draw. This collapses independent pawn/knight
reorderings even when their diagnostic half-move clocks differ. If a
counter-based draw rule is added, revisit this equivalence policy.

After king capture, the key is the board plus winner. Unspent dice, castling and
EP metadata can no longer change play and cannot manufacture extra winning
cards. The engine's `canonicalKey` is **not** used for final-state identity: it
merges symmetry classes and could conflate different visible boards.

## Quality, diversity and presentation

The maximum-utility sampled result is retained. Alternatives must fall within
the configured utility margin of that maximum and share its terminal-win class.
Within this eligible set, choose the result farthest from those already
selected, using changed board squares; rule-only differences count as one. At
most three are retained. There is no padding with low-scoring results.

Sampling also prefers different final boards after the engine suggestion. When a
terminal win is found, only terminal wins are sampled. The benchmark and
synthetic fixtures exercise openings, an exposed-king tactic and a
high-branching queen roll; they are not a tournament strength evaluation.

Shuffle the retained set once with the request seed, assign option numbers, and
deeply freeze the result in the parent thread. Public choices contain only
option number, UCI sequence and resulting DFEN. Scores, rank, seeds and search
diagnostics stay on the host. No best badge is exposed. A later host must retain
this exact set through preview/voting, rather than invoke search again for the
same round.

- A validated empty legal tree returns `forced-pass`.
- One retained candidate is available for explanatory auto-play; it does not
  necessarily mean only one legal turn existed, because quality filtering or the
  sample/deadline may have reduced the set.
- Two candidates form a two-option poll; three form a three-option poll.
- Invalid input, cancellation and failure before a completed score return
  `unavailable`, not a forced pass. Keep the game paused and explain the search
  failure rather than rerolling or inventing a candidate.

## Bounds and responsiveness

New application defaults are defined in `src/engine/types.ts`: at most eight
sampled distinct states, four equity rollouts with a four-ply horizon, a 0.08
utility margin, 25,000 visited legal leaves, a four-second cooperative deadline
and a five-second parent-thread termination timer. These are MVP defaults, not
copied production search settings or evidence of playing strength.

Both engine tree creation and one equity call are synchronous and cannot be
interrupted cooperatively through the public API. They run in a Node worker with
a 128 MiB old-generation heap limit. The parent can terminate that worker at the
hard deadline; the heap limit is not a total-process RSS limit. The host and
browser threads perform no engine search. Each request copies session ID,
position version, round ID, rolled DFEN and seed before launching the worker.
The later session controller must reject a result whose identity is stale.

After every complete equity evaluation the worker posts progress. On a hard
deadline, use only previously completed scored turns, still filtered/ranked on
the same basis, and mark the result `deadline`. If none completed, return
`unavailable`. Cancellation discards all choices. Never treat a truncated tree
as proof that no legal move exists. Even tree construction itself is protected
by the worker termination timer, not by the leaf traversal limit.

A worker error or unexpected exit discards the failed job's choices and scores,
even if it posted progress first. It returns `unavailable` / `worker-error`, so
the game pauses as an engine failure and retries the same frozen roll on
explicit resume. Completed-score fallback is reserved for the hard deadline; a
failed job must not become a retained `ready` checkpoint or a misleading storage
error.

## Reproduction and evidence

```sh
npm ci
npm run check
npm run test:browser
npm run --silent bench:candidates
```

[Recorded local measurements](measurements/candidates-local.json) contain three
sequential runs per representative fixture, exact fixture DFENs, versions,
policy and min/median/max latency including worker startup. Three runs are a
small smoke measurement, not a p95 or a cross-device performance guarantee.

Tests verify complete frozen-tree paths, deduplication of reorderings, maximum
dice consumption, two-die castling, all promotion choices, en passant, terminal
dice semantics, actual king-safety quality filtering, zero/one/two cases,
strongest-found retention, shuffled/frozen public options, cancellation, timeout
and host HTTP responsiveness while a worker searches. The built Node adapter is
also exercised against its compiled worker.

Sources for the pinned public foundation:

- [0.14.9 JS API contract](https://github.com/fortemate/dicechess-engine/blob/v0.14.9/js/dicechess-engine.d.ts)
- [Equity algorithm](https://github.com/fortemate/dicechess-engine/blob/v0.14.9/shared/src/main/scala/dicechess/engine/search/MonteCarloEquity.scala)
- [Turn tree export](https://github.com/fortemate/dicechess-engine/blob/v0.14.9/js/src/main/scala/dicechess/engine/api/TurnTreeOps.scala)

No private corpus, model, book, production profile or TV asset is reused. The
DFEN fixtures were authored for this adapter; no engine source was copied.
