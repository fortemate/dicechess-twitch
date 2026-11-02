# Twitch Plays Dice Chess

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=fortemate_dicechess-twitch&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=fortemate_dicechess-twitch)

A streamer plays Dice Chess freely; their Twitch chat chooses between up to
three engine-generated complete turns. Built with OpenAI Codex for the
[Codex x TwitchCon Hackathon](https://twitchcon-codex.devpost.com/).

**Status: MVP with a focused live Twitch test completed.** Streamer play,
candidate generation, OAuth/EventSub, voting, animated previews and durable
recovery are implemented. Automated checks use the public engine and explicit
Twitch fixtures. A real broadcaster-account vote, complete-turn execution and
the resulting board in the Twitch player were verified on November 2, 2026.
Multi-viewer broadcast and live failure-recovery checks remain pending; see
[checks and evidence](#checks-and-evidence). The owner submitted the project on
November 2, 2026.

**[Watch the 2:39 demo](https://youtu.be/sJgxRbO8JU0)** ·
**[Devpost entry](https://devpost.com/software/twitch-plays-dice-chess)** ·
**[Judge run guide](docs/judging/run.md)**

## Run locally

Requires Git, Node.js **24.22.1** and npm **11.19.1**. With
[mise](https://mise.jdx.dev/):

```sh
git clone https://github.com/fortemate/dicechess-twitch.git
cd dicechess-twitch
mise trust
mise install
mise exec -- npm ci
mise exec -- npm run dev
```

For an unmerged PR, check out its head branch before installing. With the exact
Node/npm versions already active, omit the mise commands and wrapper.

Open the [operator](http://127.0.0.1:4310/) to start a game and play legal
streamer turns. Add the read-only [game scene](http://127.0.0.1:4311/) to OBS as
a 1920 × 1080 Browser Source. Both listeners bind to the local machine.

Local play and candidate previews need no Twitch credentials. Multi-choice
voting waits for a healthy Twitch connection. To connect a real channel, follow
the [broadcaster setup](docs/twitch-connection.md): register a public Twitch
application, launch with its public Client ID and personally approve access from
the operator page. This application requests chat-read access only.

The host saves to `.local/session.json`. After restart, reload the operator and
explicitly resume the restored game. Twitch authorization stays in memory and
must be renewed after restart. Keep the operator page off the stream.

## The MVP

Dice faces name piece types. One turn can contain several moves using the rolled
pieces; the engine determines complete legal turns. Capture the opposing king to
win.

1. The streamer rolls and plays any legal turn on the board.
2. The chat side rolls once; the engine prepares up to **three distinct
   complete-turn choices**.
3. Viewers see numbered final-position previews and vote with `!vote 1`,
   `!vote 2` or `!vote 3`.
4. One equal-weight vote per viewer counts, with changes allowed until voting
   closes.
5. The winning sequence plays automatically and control returns to the streamer.

Three is the maximum number of meaningful choices, not a requirement to
fabricate alternatives. With no legal turn, the side passes; one meaningful
choice is visibly auto-played. A poll with no votes waits for the operator
rather than pretending an audience decision occurred.

## Checks and evidence

```sh
mise exec -- npm run check
mise exec -- npx playwright install chromium
mise exec -- npm run test:browser
```

`check` runs formatting, strict TypeScript, build and Node tests. A clean public
clone of application revision `d055ab7` on November 2 passed **80 Node tests and
14 Chromium scenarios**, with **zero npm audit vulnerabilities** at install
time. Two complete games also passed with real engine workers, fake Twitch and
accelerated timers. See the
[current verification record](docs/measurements/judging-2026-11-02.json). These
are local integration checks, not independent-viewer or stream-latency
measurements. The [October 25 report](docs/measurements/integration-local.json)
is retained as a historical baseline.

### Focused live tests — November 2, 2026

The local application at revision `d055ab7` was connected to real Twitch chat
and broadcast through OBS. The broadcaster account sent `!vote 1` during an open
poll. The host recorded one voter, a **1–0–0** tally and option 1 as the winner.
It executed **b7–b6, c8–b7, h6–f5** and returned control to the streamer. The
resulting board was visually verified in the live Twitch player, rather than
only in the local OBS preview. The owner confirmed intelligible voice in Twitch
playback.

OBS reported zero network-dropped frames before stopping the test stream. An
encoding-overload warning appeared earlier and was absent at the final checks;
this does not establish zero encoding skips throughout the broadcast.

The later recorded demo contains a second real vote: option 2 won **0–1–0**. The
black knight moved **f5–e3**, captured the white queen on **d1**, and the black
king moved **d7–c8**. Control returned to the streamer. The English demo
includes actual Codex review/check footage and owner-approved narration.

Both checks used one accepted broadcaster-account voter. Independent-viewer
voting and vote changes, disconnect/reconnect and authorization recovery during
a broadcast remain unverified. Automated fixtures remain separate evidence for
cases not exercised live.

### Optional fixture checks

```sh
mise exec -- npm run rehearse:full-game
mise exec -- npm run rehearse:fixtures -- promotion
```

The full-game runner writes reports under `.local/rehearsals/`. The separate
rare-case host uses ports 4410/4411, fixed positions/dice and no Twitch or saved
operator game. See [development](docs/development.md) for repeatable checks and
[broadcast rehearsal](docs/broadcast-rehearsal.md) for the broader live
checklist.

## Limits

- One local game and one installed broadcaster channel; no hosted service.
- At most three meaningful choices. The engine adapter performs bounded sampling
  and evaluation; it does not promise a globally optimal top three.
- Stream delay varies; the focused live test establishes no latency guarantee.
  Vote admission has zero delivery grace; a delayed viewer's intended round
  cannot be inferred from plain `!vote N`.
- Real OAuth/chat, one broadcaster-account vote and the resulting Twitch video
  have been checked. Multi-viewer play and account/network recovery still need
  live rehearsal. Local fixtures do not establish those outcomes.

## Project documents

- [Contributing](CONTRIBUTING.md), [security reporting](SECURITY.md) and
  [repository checks](docs/repository-checks.md): review policy, dependency
  updates and owner setup for CodeRabbit/SonarQube Cloud.
- [MVP specification](docs/mvp.md): accepted scope, voting rules and completion
  criteria.
- [Architecture](docs/architecture.md): local application, state ownership and
  engine boundary.
- [Twitch connection](docs/twitch-connection.md): public-client setup, transport
  lifecycle and remaining live verification.
- [Recovery](docs/recovery.md): durable checkpoints, explicit resume and saving
  failure behavior.
- [Presentation](docs/presentation.md): host-owned previews, actual final boards
  and the read-only broadcast scene.
- [Voting](docs/voting.md): deadline/late-event policy, equal votes, ties and
  empty-poll recovery.
- [Game state](docs/game-state.md): implemented controls, transitions and
  limits.
- [Candidate adapter](docs/candidate-generation.md): evaluation basis,
  rule-state deduplication and worker bounds.
- [Delivery plan](docs/delivery-plan.md): dated milestones and the
  implementation issue graph.
- [Broadcast rehearsal](docs/broadcast-rehearsal.md): owner-run live cases,
  isolated rare-case fixtures and an unfilled evidence template.
- [Judging package](docs/judging/README.md): English description, recorded demo,
  verified implementation session and run/access checklist.
- [Submission checklist](docs/submission.md): judging access, English demo and
  the actual Codex session.
- [Issues](https://github.com/fortemate/dicechess-twitch/issues): unfinished
  work and current implementation status.

## Dates and existing foundation

The owner completed the
[Devpost entry](https://devpost.com/software/twitch-plays-dice-chess) on
November 2, 2026. The demonstration uses application revision
`d055ab79248536fd2be01b05e4973c6b2011f5cc`; documentation may be updated
separately. Keep the judged source and required viewing/testing access available
throughout judging. See the [submission record](docs/submission.md).

The existing [Dice Chess Engine](https://github.com/fortemate/dicechess-engine)
supplies the rules, legal turn generation and search foundation. This new
project owns the Twitch connection, three-choice audience experience, voting,
presentation and session orchestration developed during the hackathon window.
The submission identifies reused work separately.

See [third-party provenance](docs/provenance.md) for the pinned public engine,
tools and asset sources. No private models, books, production search profiles or
restricted media assets are bundled.

## License

Project-authored code and documentation are licensed under
[AGPL-3.0-only](LICENSE). Third-party components retain their licenses. The
cburnett chess piece SVGs retain their GPL-3.0-or-later license and author
credit; see [third-party artwork notices](THIRD_PARTY_NOTICES.md). The Fortemate
name and logo are not licensed under the AGPL; asset permissions must be checked
separately before reuse. See the bundled
[Fortemate brand notice](src/client/brand/NOTICE.txt).
