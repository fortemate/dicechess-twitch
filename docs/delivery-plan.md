# Delivery plan

Plan recorded October 25, 2026. GitHub Issues and their native dependencies own current execution
state; dates below are targets, not completion claims. No implementation has been completed by
this planning change. The owner has made development capacity available after the previous
Amazon hackathon submission window.

Parent MVP: [fortemate/dicechess-twitch#1](https://github.com/fortemate/dicechess-twitch/issues/1).

## Milestones

| Milestone                          | Europe/Riga target                                       | Exit condition                                                                                                   |
| ---------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| M1: real-chat vertical slice       | October 27                                               | A real vote selects a full legal turn and returns control to the streamer.                                       |
| M2: broadcast rehearsal            | October 29                                               | Three readable choices, OBS capture and safe interrupted-poll recovery work together.                            |
| M3: judging package and submission | Package November 1; owner submission November 2 at 22:00 | Verified English materials and reproducible access; owner confirms Submitted state before the official deadline. |

GitHub milestone due dates are calendar dates. Explicit time-of-day targets in this document and
the submission issue use Europe/Riga; they are not encoded by GitHub's date-only milestone value.

## Implementation work

| Task                                                     | Target                                            | Hard dependencies                        | Issue                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Bootstrap local application and checks                   | October 26                                        | None                                     | [fortemate/dicechess-twitch#2](https://github.com/fortemate/dicechess-twitch/issues/2)   |
| Prove three distinct ranked complete turns               | October 26                                        | None; adapter integration decision first | [fortemate/dicechess-twitch#3](https://github.com/fortemate/dicechess-twitch/issues/3)   |
| Implement free streamer play and authoritative game      | October 26                                        | Application scaffold                     | [fortemate/dicechess-twitch#4](https://github.com/fortemate/dicechess-twitch/issues/4)   |
| Connect real Twitch chat                                 | October 27                                        | Application scaffold                     | [fortemate/dicechess-twitch#5](https://github.com/fortemate/dicechess-twitch/issues/5)   |
| Implement round-scoped voting and exactly-once execution | October 27                                        | Candidates, game state, Twitch           | [fortemate/dicechess-twitch#6](https://github.com/fortemate/dicechess-twitch/issues/6)   |
| Show readable previews and OBS scene                     | October 28                                        | Candidates and game state                | [fortemate/dicechess-twitch#7](https://github.com/fortemate/dicechess-twitch/issues/7)   |
| Persist/recover the session safely                       | October 29                                        | Game state, Twitch, voting               | [fortemate/dicechess-twitch#8](https://github.com/fortemate/dicechess-twitch/issues/8)   |
| Run full-game broadcast and failure-case QA              | First rehearsal October 29; acceptance October 31 | Presentation, recovery, voting           | [fortemate/dicechess-twitch#9](https://github.com/fortemate/dicechess-twitch/issues/9)   |
| Prepare English demo and judging package                 | November 1                                        | QA evidence                              | [fortemate/dicechess-twitch#10](https://github.com/fortemate/dicechess-twitch/issues/10) |
| Verify judge access and submit                           | November 2 at 22:00                               | Complete judging package; owner action   | [fortemate/dicechess-twitch#11](https://github.com/fortemate/dicechess-twitch/issues/11) |

Planning/bootstrap documentation: [fortemate/dicechess-twitch#12](https://github.com/fortemate/dicechess-twitch/issues/12).

Every task is in Fortemate Engineering with native Issue Type, organization Priority, Execution
tier, workflow Status, milestone where applicable and native parent/dependency relationships.
Ready means sufficiently defined and available to start. Blocked successors stay in Backlog.
No Jules label or execution dispatch is authorized by this plan.

## Critical path and scope control

First prove candidate generation and local startup, then game/chat integration, voting, readable
broadcast/recovery, real-viewer QA and the judging package. Candidate generation and Twitch
authorization are the main technical unknowns. Confirm them early rather than spending the first
days on visual polish.

If the October 27 vertical slice slips, simplify animation and optional presentation polish and
reassess the schedule. Keep legal full turns, three meaningful choices where available, real Twitch
votes, clear final-position previews and safe exactly-once resolution. Do not replace real broadcast
evidence with a simulated chat or postpone all verification until submission day.

Reserve October 30-31 for observed defects and a clean-checkout run. Prepare the video, description,
repository access and actual Codex session ID by November 1. November 2 is a submission buffer,
not a planned feature-development day.

## Official deadline

The rules state **November 2, 2026, 14:00 Pacific Time**. On that date America/Los_Angeles is UTC-8,
which corresponds to **November 2 at 22:00 UTC / November 3 at 00:00 Europe/Riga**. The organizer
FAQ currently contains an inconsistent UTC conversion. Follow the official Pacific-time statement
and countdown, and keep the earlier internal submission target above.

[Official rules](https://twitchcon-codex.devpost.com/rules) ·
[Organizer FAQ](https://twitchcon-codex.devpost.com/resources)
