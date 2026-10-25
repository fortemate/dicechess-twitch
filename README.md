# Twitch Plays Dice Chess

A streamer plays Dice Chess freely; their Twitch chat chooses between three
engine-generated complete turns. Built with OpenAI Codex for the
[Codex x TwitchCon Hackathon](https://twitchcon-codex.devpost.com/).

**Status, October 25, 2026:** local streamer play, engine candidate preparation,
OAuth/EventSub and host-owned voting are implemented with fixture checks. The
host freezes up to three complete choices, counts equal votes with changes,
handles empty polls explicitly and executes the winner once. Actual broadcaster
consent/channel rehearsal remains pending. Durable local recovery restores
active play paused with its committed board, roll, choices and history.
Engine-approved animated previews and final-position miniatures are available.
No submission is implied.

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
fabricate alternatives. No legal turn forces a pass; one meaningful choice is
visibly auto-played. A poll with no votes waits for the operator rather than
pretending an audience decision occurred.

## Project documents

- [MVP specification](docs/mvp.md): accepted scope, voting rules and completion
  criteria.
- [Architecture](docs/architecture.md): proposed local application, state
  ownership and engine boundary.
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
- [Issues](https://github.com/fortemate/dicechess-twitch/issues) and
  [Fortemate Engineering](https://github.com/orgs/fortemate/projects/1): current
  execution state.

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

The repository is currently private. Reviewer access and any change in
visibility are recorded separately in the submission task. Do not copy private
evaluators, weights, books, production search profiles or restricted
voice/music/portrait assets into this application.

## Development

Use Node.js **24.22.1** and npm **11.19.1** (or `mise trust && mise install`).
From this repository:

```sh
npm ci
npm run dev
```

Open [operator](http://127.0.0.1:4310/) and [OBS scene](http://127.0.0.1:4311/).
Publish a message from the operator page; both pages receive the same committed
revision. Start a game, roll once and select a piece/destination; highlighted
actions come from the frozen engine tree. The CLI saves to `.local/session.json`
and restores active games paused after restart; reload the operator and resume
explicitly. Keep both ports local.

`npm run check` runs formatting, strict TypeScript, build and host/engine tests.
For the real-browser check, run `npx playwright install chromium` and
`npm run test:browser`. `npm run rehearse:full-game` runs two isolated headless
games with real engine workers, fake Twitch and accelerated timers; reports stay
in `.local/rehearsals/`.

See [development and verification](docs/development.md) for clean-start, build
and two-page checks, and [third-party provenance](docs/provenance.md) for the
pinned public engine and tools.

## License

Project-authored code and documentation are licensed under
[AGPL-3.0-only](LICENSE). Third-party components retain their licenses. The
Fortemate name and logo are not licensed under the AGPL; asset permissions must
be checked separately before reuse.
