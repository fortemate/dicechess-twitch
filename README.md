# Twitch Plays Dice Chess

A streamer plays Dice Chess freely; their Twitch chat chooses between three
engine-generated complete turns. Built with OpenAI Codex for the
[Codex x TwitchCon Hackathon](https://twitchcon-codex.devpost.com/).

**Status, October 25, 2026:** local streamer play and engine candidate
preparation are runnable. The operator can roll and freely choose complete legal
turns on the board; the host prepares up to three frozen chat choices. Forced
passes and single retained choices run automatically. Multiple choices wait for
Twitch voting integration. Live Twitch, timed polls, full preview presentation
and durable recovery are still pending; no submission is implied.

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
- [Game state](docs/game-state.md): implemented controls, transitions and
  limits.
- [Candidate adapter](docs/candidate-generation.md): evaluation basis,
  rule-state deduplication and worker bounds.
- [Delivery plan](docs/delivery-plan.md): dated milestones and the
  implementation issue graph.
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
actions come from the frozen engine tree. State is in memory and resets on host
restart. Keep both ports local.

`npm run check` runs formatting, strict TypeScript, build and host/engine tests.
For the real-browser check, run `npx playwright install chromium` and
`npm run test:browser`.

See [development and verification](docs/development.md) for clean-start, build
and two-page checks, and [third-party provenance](docs/provenance.md) for the
pinned public engine and tools.

## License

Project-authored code and documentation are licensed under
[AGPL-3.0-only](LICENSE). Third-party components retain their licenses. The
Fortemate name and logo are not licensed under the AGPL; asset permissions must
be checked separately before reuse.
