# Judging package — prepared draft

Issue:
[fortemate/dicechess-twitch#10](https://github.com/fortemate/dicechess-twitch/issues/10).
Prepared October 25, 2026. Local implementation/checks exist; **real broadcaster
consent, a complete human-viewer game, demo footage, judge access and submission
are not established by this package**. Nothing has been published or sent to
reviewers by this preparation.

| Material                                    | State                                                                                                                                             | Source                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| English description                         | Draft ready for owner review; live-evidence status retained                                                                                       | [Description](description.en.md)              |
| Demo narration / shot list                  | Planned 2:40 cut; required real footage absent                                                                                                    | [Demo plan](demo.en.md)                       |
| Primary Codex session                       | Actual implementation ID verified from matching metadata                                                                                          | [Session record](session.md)                  |
| Fresh-checkout / Twitch setup / limitations | Instructions select the pinned review baseline; final judging commit not chosen                                                                   | [Run guide](run.md)                           |
| Application tests                           | Review baseline `e3515e7`: 64 Node and 13 Chromium checks passed in CI; local complete-game fixtures remain distinct from real broadcast evidence | [Development](../development.md)              |
| Built-process restart                       | Isolated SIGKILL/restart rehearsal recorded                                                                                                       | [Report](../measurements/recovery-local.json) |
| Real broadcast evidence                     | Not performed; report template is deliberately unfilled                                                                                           | [Rehearsal](../broadcast-rehearsal.md)        |
| Existing components / assets                | Public engine is pre-existing; new application and notices separated                                                                              | [Provenance](../provenance.md)                |
| Repository visibility / judge access        | Repository verified private October 25; judge invitation/access not verified                                                                      | [Owner checklist](../submission.md)           |
| YouTube / Devpost                           | No verified video URL or Submitted confirmation                                                                                                   | [Owner checklist](../submission.md)           |

The [official rules](https://twitchcon-codex.devpost.com/rules) require the
project description, code/testing access, primary Codex session and a short
Twitch/Codex demo. The
[organizer FAQ](https://twitchcon-codex.devpost.com/resources) accepts unlisted
YouTube viewing and explains the owner submission workflow. Review current
requirements before publishing; this draft does not enter the event or grant
repository access.

## Review order

1. Review/merge the implementation stack and choose an exact judged revision.
   [PR #15](https://github.com/fortemate/dicechess-twitch/pull/15) contains the
   complete-turn proof; subsequent PRs add game, connection, votes, presentation
   and recovery. Private-repository access is required until the owner decides
   otherwise.
2. Complete the real channel rehearsal and fill observed results/defects. Keep
   synthetic fixture footage separate; it cannot establish a live audience.
3. Record the actual shots in the demo plan, including Codex development
   footage. Replace missing evidence with real material, then review
   duration/permissions.
4. Review the English text, exact build/run instructions, known limitations and
   main session ID. Update claims only when supported by the captured evidence.
5. The owner handles viewing/code access, any media publication and final entry.
   Preserve the judged revision/materials as the submission checklist specifies.
