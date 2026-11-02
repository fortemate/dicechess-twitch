# Twitch Plays Dice Chess — judging guide

**[Watch the 2:39 demo](https://youtu.be/sJgxRbO8JU0)** ·
**[Devpost entry](https://devpost.com/software/twitch-plays-dice-chess)** ·
**[Install and test](run.md)**

The streamer chooses their own legal turns. Twitch chat chooses between up to
three complete plans, with final-position boards and animated previews. Dice
specify the piece types available for a turn; capturing the opposing king wins.
The audience votes on a whole plan, so the consequences of every move are
visible.

The owner completed the Devpost entry on November 2, 2026. The repository is
public and the YouTube demo is accessible by link. The demonstrated application
revision is `d055ab79248536fd2be01b05e4973c6b2011f5cc`.

| Material                    | What it establishes                                                                   | Source                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| English project story       | Product, design decisions, Codex use and limits                                       | [Description](description.en.md)                                           |
| Demo                        | Actual Twitch voting, execution and genuine Codex work footage; English narration     | [Video notes](demo.en.md)                                                  |
| Primary development session | Owner-confirmed thread where the application was built                                | [Session record](session.md)                                               |
| Clean public clone          | 80 Node tests, 14 Chromium scenarios and two complete fixture games passed            | [Verification record](../measurements/judging-2026-11-02.json)             |
| Real Twitch rehearsal       | A single broadcaster-account vote selected a complete turn; OBS output reached Twitch | [Evidence and limits](../../README.md#focused-live-tests--november-2-2026) |
| Rules, search and assets    | Existing public engine and third-party artwork identified separately                  | [Provenance](../provenance.md)                                             |
| Entry and continued access  | Published project and recorded hackathon submission                                   | [Submission record](../submission.md)                                      |

## Review in this order

1. Watch the demo: chat's chosen knight captures the streamer's queen.
2. Read the [project story](description.en.md) for why viewers choose full
   plans.
3. Follow the [run guide](run.md) to try local play without credentials, then
   optionally connect your own Twitch channel with personal authorization.
4. Review the [host](../../src/host/session.ts),
   [candidate adapter](../../src/engine/search.ts),
   [vote admission](../../src/voting/poll.ts) and
   [broadcast boundary](../../src/host/server.ts).

Local fixtures cover duplicate messages, vote changes, deadlines, interruptions
and recovery. They do not establish independent multi-viewer play, real-service
failure recovery, stream-latency guarantees or audience engagement. The two live
votes are single-account rehearsals, not a crowd study.
