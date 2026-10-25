# Twitch Plays Dice Chess

A streamer plays Dice Chess freely; their Twitch chat chooses between up to
three engine-generated complete turns. Built with OpenAI Codex for the
[Codex x TwitchCon Hackathon](https://twitchcon-codex.devpost.com/).

**Status: local MVP, live Twitch verification pending.** Streamer play,
candidate generation, OAuth/EventSub, voting, animated previews and durable
recovery are implemented. Automated checks use the public engine and explicit
Twitch fixtures. Real broadcaster consent, a human-viewer Twitch/OBS game and
demo footage have not been verified. This repository is not a submitted entry.

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

For an unmerged PR, check out its head branch before installing. Repository
access is required while it remains private. With the exact Node/npm versions
already active, omit the mise commands and wrapper.

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

`check` runs formatting, strict TypeScript, build and Node tests. The recorded
[application baseline](docs/measurements/integration-local.json) passed **67
Node tests and 13 Chromium scenarios**. A fresh checkout completed two games
with real engine workers, fake Twitch and accelerated timers; these are local
integration checks, not live audience or stream-latency evidence.

Optional fixture checks:

```sh
mise exec -- npm run rehearse:full-game
mise exec -- npm run rehearse:fixtures -- promotion
```

The full-game runner writes reports under `.local/rehearsals/`. The separate
rare-case host uses ports 4410/4411, fixed positions/dice and no Twitch or saved
operator game. See [development](docs/development.md) for repeatable checks and
[broadcast rehearsal](docs/broadcast-rehearsal.md) for the unfinished live plan.

## Limits

- One local game and one installed broadcaster channel; no hosted service.
- At most three meaningful choices. The engine adapter performs bounded sampling
  and evaluation; it does not promise a globally optimal top three.
- Stream delay has not been measured. Vote admission has zero delivery grace; a
  delayed viewer's intended round cannot be inferred from plain `!vote N`.
- Real OAuth/chat, human-viewer play, OBS capture and account/network recovery
  still need a broadcaster-run rehearsal. Local fixtures do not establish them.

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
- [Judging package draft](docs/judging/README.md): English description,
  real-footage shot plan, verified implementation session and run/access
  checklist.
- [Submission checklist](docs/submission.md): judging access, English demo and
  the actual Codex session.
- [Issues](https://github.com/fortemate/dicechess-twitch/issues): unfinished
  work and current implementation status.

## Dates and existing foundation

The submission window is October 23-November 2, 2026. The official deadline is
November 2 at 14:00 Pacific Time. Our package-ready target is **November 1** and
owner submission target is **November 2 at 22:00 Europe/Riga**, with time
reserved before the official deadline.

The existing [Dice Chess Engine](https://github.com/fortemate/dicechess-engine)
supplies the rules, legal turn generation and search foundation. This new
project owns the Twitch connection, three-choice audience experience, voting,
presentation and session orchestration developed during the hackathon window.
Reused work will be identified explicitly in the submission.

See [third-party provenance](docs/provenance.md) for the pinned public engine,
tools and asset sources. No private models, books, production search profiles or
restricted media assets are bundled.

## License

Project-authored code and documentation are licensed under
[AGPL-3.0-only](LICENSE). Third-party components retain their licenses. The
Fortemate name and logo are not licensed under the AGPL; asset permissions must
be checked separately before reuse.
