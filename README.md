# Twitch Plays Dice Chess

A streamer plays Dice Chess freely; their Twitch chat chooses between three engine-generated
complete turns. Built with OpenAI Codex for the
[Codex x TwitchCon Hackathon](https://twitchcon-codex.devpost.com/).

**Status, October 25, 2026:** repository and MVP planning are being established. There is no runnable
Twitch application yet. Implementation, broadcast verification, registration and submission are
separate tracked steps; none is implied by this README.

## The MVP

1. The streamer rolls and plays any legal turn on the board.
2. The chat side rolls once; the engine prepares up to **three distinct complete-turn choices**.
3. Viewers see numbered final-position previews and vote with `!vote 1`, `!vote 2` or `!vote 3`.
4. One equal-weight vote per viewer counts, with changes allowed until voting closes.
5. The winning sequence plays automatically and control returns to the streamer.

Three is the maximum number of meaningful choices, not a requirement to fabricate alternatives.
No legal turn forces a pass; one meaningful choice is visibly auto-played. A poll with no votes
waits for the operator rather than pretending an audience decision occurred.

## Project documents

- [MVP specification](docs/mvp.md): accepted scope, voting rules and completion criteria.
- [Architecture](docs/architecture.md): proposed local application, state ownership and engine boundary.
- [Delivery plan](docs/delivery-plan.md): dated milestones and the implementation issue graph.
- [Submission checklist](docs/submission.md): judging access, English demo and the actual Codex session.
- [Issues](https://github.com/fortemate/dicechess-twitch/issues) and
  [Fortemate Engineering](https://github.com/orgs/fortemate/projects/1): current execution state.

## Dates and existing foundation

The submission window is October 23-November 2, 2026. The official deadline is November 2 at
14:00 Pacific Time. Our package-ready target is **November 1** and owner submission target is
**November 2 at 22:00 Europe/Riga**, with time reserved before the official deadline.

The existing [Dice Chess Engine](https://github.com/fortemate/dicechess-engine) supplies the rules,
legal turn generation and search foundation. This new project owns the Twitch connection,
three-choice audience experience, voting, presentation and session orchestration developed during
the hackathon window. Reused work will be identified explicitly in the submission.

The repository is currently private. Reviewer access and any change in visibility are recorded
separately in the submission task. Do not copy private evaluators, weights, books, production search
profiles or restricted voice/music/portrait assets into this application.

## Development

The application scaffold is an implementation task. Runtime, installation, startup and check
commands will be added when they exist and have been verified from a clean checkout.

For the present documentation change, use `git diff --check`, a pinned Prettier Markdown check,
relative-link validation and the canonical Fortemate shared-block check described in `AGENTS.md`.

## License

Project-authored code and documentation are licensed under [AGPL-3.0-only](LICENSE). Third-party
components retain their licenses. The Fortemate name and logo are not licensed under the AGPL;
asset permissions must be checked separately before reuse.
