# Sonar baseline and follow-up

The first analysis on October 25, 2026 at revision `f5d34be` reported 107 open
findings: four in the Bug category and 103 code smells. This is a dated triage
snapshot, not a claim that every finding is a confirmed defect or is fixed by
the coverage integration. The baseline covers `src` and `scripts`, not the
third-party engine. No rule has been disabled and no issue has been hidden.

## Canonical string ordering

The four `typescript:S2871` findings are two sorts used to compare checkpoint
key sets, one command-key sort and one remaining-dice sort. These are technical
identifiers, not natural-language words. Their contract needs the same UTF-16
ordering on every host, including case and duplicate dice. Locale collation is
not the intended behavior. An explicit shared comparator preserves that order
and documents the intent. A contract test rejects locale collation while
exercising checkpoint parsing, command validation and dice-order equivalence.

This changes no valid saved format, command schema, rule-state equivalence,
search policy or voting behavior. Main-branch issue resolution must be checked
after owner merge; a clean PR analysis alone does not remove main's baseline.

## Remaining rule groups

| Rule               | Count | Triage and next verification                                                                                                                                             |
| ------------------ | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `typescript:S3358` |    31 | Nested conditionals, mainly presentation/state code. Refactor in focused changes with the existing board, reconnect and preview browser checks.                          |
| `typescript:S3776` |    13 | Cognitive complexity, including state transitions and checkpoint validation. Preserve transitions and fail-closed behavior; avoid a bulk refactor during coverage setup. |
| `typescript:S2933` |     9 | Candidate readonly members. Check actual lifecycle writes and serialization before tightening types.                                                                     |
| `typescript:S6582` |     8 | Optional chaining suggestions. Check each guard's null/false semantics; low-priority readability work.                                                                   |
| `css:S4666`        |     8 | Repeated selectors. Review cascade and responsive overrides with both viewport layouts before consolidating.                                                             |
| `typescript:S4624` |     7 | Nested templates in the renderer. Extract rendering pieces together with relevant complexity findings; verify escaping and DOM behavior.                                 |
| `Web:S6819`        |     7 | Semantic alternatives for live/status regions. Review accessibility behavior rather than substituting tags solely to remove a warning.                                   |
| `typescript:S7722` |     4 | Internal empty error construction in lock handling. Check the sanitized outer error boundary and ownership refusal before changing diagnostics.                          |
| `typescript:S7758` |     4 | Character versus code-point access on move coordinates. Inputs are ASCII UCI tokens; preserve validation and promotion/castling semantics.                               |
| `typescript:S9382` |     3 | Sequential OAuth polling and benchmark iterations. Polling must honor delay/abort/expiry and benchmark samples must not compete in parallel. Keep required sequencing.   |
| `typescript:S6551` |     2 | Unknown-value string coercion in checkpoint validation merits a targeted raw-type/fail-closed review; do not just replace conversion syntax.                             |
| `typescript:S7785` |     2 | Background operator refresh calls after bootstrap. Awaiting them can alter startup/refresh ordering; check their identity and failure handling first.                    |
| `javascript:S9382` |     2 | Dev-watch close/rebuild serialization. Parallel restart can race the checkpoint lock/listeners; preserve sequencing.                                                     |
| `typescript:S7776` |     1 | Phase-array membership. A Set is a possible cleanup; first retain strict validation semantics.                                                                           |
| `typescript:S7718` |     1 | Catch variable naming. Style-only; group with a focused file-store change.                                                                                               |
| `css:S9423`        |     1 | The `[hidden]` display override intentionally wins over component display rules. Removing it can expose hidden controls; keep the hiding contract.                       |

These groups total 103. The descriptions distinguish intentional control flow,
safe cleanup candidates and changes that need stronger behavior/accessibility
evidence. They are not remote False Positive/Accepted transitions. Follow-up
work should target one contract at a time, with regressions where appropriate.

## Measured coverage boundary

`npm run test:coverage` uses Node 24's experimental test coverage and LCOV
reporter on direct `.ts` imports. Type stripping preserves their line layout;
the report is checked against actual source paths/line ranges. It does not add
browser execution or remap bundled worker code into TypeScript. Sonar must keep
all application sources in its coverage denominator, including those absent from
LCOV. No thresholds, coverage exclusions or fixture results are used to
manufacture a higher percentage.

Coverage generation runs without a Sonar credential. The scanner receives the
report through a same-run artifact and reads the checked-out sources in a
separate job. Fork and Dependabot PRs retain the existing explicit skip policy;
ordinary application, dependency and CodeQL checks still run. Verify the normal
repository PR's uploaded head, LCOV import, quality gate and GitHub decoration
before making a Sonar check mandatory for all contributions.
