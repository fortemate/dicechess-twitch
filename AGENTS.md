# AGENTS.md

Twitch Plays Dice Chess is a new streamer-versus-chat application for Codex x TwitchCon 2026.
The accepted MVP offers up to three engine-generated **complete legal turns** to the audience;
the streamer chooses their own legal moves freely.

## Current scope and sources

- This repository contains local streamer play, engine candidate preparation and fixture-tested
  Twitch OAuth/EventSub plus host-owned vote collection/timers. Real broadcaster/channel
  verification remains separate work. Durable checkpoint/recovery code is implemented in
  `docs/recovery.md`; never persist OAuth/activation material, raw chat or voter maps. Host-owned animated previews and
  final-position miniatures are implemented; see `docs/presentation.md`. Keep verified startup/checks in
  `docs/development.md`, game behavior in `docs/game-state.md` and voting policy in
  `docs/voting.md`; never invent evidence.
- `docs/mvp.md` owns accepted scope; `docs/architecture.md` distinguishes proposed implementation
  choices from verified behavior. GitHub Issues own unfinished work and dependencies.
- The Dice Chess Engine owns rules and search. Never reimplement maximum dice consumption by
  validating each micro-move independently; follow the canonical complete-turn tree.
- Keep one authoritative session host. OBS is a read-only view, never an independent dice roller,
  poll timer or move executor. Scope asynchronous results to a session, position and round ID.
- Candidate order freezes before preview. Deduplicate resulting rule states, not just move strings.
- Do not add five-choice mode, monetization, tournaments, voice packs or multi-channel hosting
  during the MVP deadline without an explicit scope decision.
- Real channel/human broadcast evidence remains unfinished. Use `docs/broadcast-rehearsal.md`
  and its unfilled report template. Rare-case fixed-dice sessions live under `tests/rehearsal/`,
  must stay visibly non-production and never authorize Twitch or load the operator checkpoint.
- Creating issues does not authorize Jules dispatch or external messaging.

## Application validation

- Use Node.js/npm pinned by `mise.toml`, `.node-version` and `package.json`; install with `npm ci`.
- Run `npm run check` (format, strict TypeScript, build, host/engine tests) and
  `npm run test:browser` (install Chromium with `npx playwright install chromium` first).
- Run `git diff --check`; confirm modified documentation links and live issue dependencies.
- Check applicable shared blocks against canonical `fortemate/.github/AGENTS.md` using the
  `agents-shared-blocks` skill before opening a PR that changes this file.
- Keep OBS resources read-only at the HTTP boundary, not just by hiding controls. Public snapshots
  use an explicit projection; operator authority and private configuration must never enter it.
- Stage only named files, use an English conventional commit and a feature branch, and open a PR.
  The owner reviews and merges; do not push tags or publish a site.

## Publication boundary

<!-- dc-shared:publication v4 — keep identical across Fortemate repositories -->

- Fortemate is open-core. Public by nature, in the public repositories: their source (engine rules
  and search, feature definitions and extractors, bot templates, the play client and server), serving
  contracts, mechanics, and the programme numbers already published in the project READMEs. Private
  repositories (evaluation service, training pipelines, proprietary evaluators, house bots, analytics,
  infrastructure) stay private in full; this rule governs what may be written into the public ones.
- Always private, wherever it is written: trained weights, opening books, labelled corpora, production
  parameter **values** (search profiles, candidate limits, table sizes, blend weights, time budgets),
  experiment **verdicts** (win rates, feature importance, cost ratios, negative results) and the names
  of private artifacts, hosts and internal paths.
- Before writing to a public repository — code, docs, scaladoc, commit messages, Issues, pull requests,
  review replies — check the text against that list. Values and verdicts go to the private knowledge
  base (`fortemate-internal`, a private repository agents read and write through the owner's access;
  naming it is the address, not a disclosure) and are referenced from public text by page title only;
  examples use placeholders such as `<candidate-limit>` instead of real values.
- The rule is forward-only (ADR 009): nothing already published is retracted and history is never
  rewritten. When unsure whether something is a definition or a verdict, ask the owner before
  publishing.

<!-- /dc-shared:publication -->

## Issue management

<!-- dc-shared:issue-management v7 — keep identical across Fortemate repositories -->

- Classify work with the native GitHub Issue Type: `Bug` (unexpected or incorrect behavior), `Feature` (request, idea, new user-visible capability), `Task` (a specific piece of engineering, research, maintenance or documentation work). Labels on Issues name a technical domain or cross-cutting concern only, never repeat the Type, and must already exist in the repository.
- Never commit to a repository's default branch. Name branches you control `<type>/<short-description>` or `<type>/<issue-id>-<short-description>` with a type from `task|feat|bug|refactor|chore|docs|ci|test|perf`. A branch that carries an Issue id must be closed by its pull request (`Closes #<id>`, or `Closes owner/repository#<id>` across repositories); partial work uses a non-closing reference. Before dispatching an external tool, read the repository's live PR-policy workflow: a tool-managed branch name is acceptable only when that policy allows it and the pull request closes the delegated leaf Issue — never edit a workflow to make a generated branch pass. A delegated pull request and its commits close only their leaf Issue, never a parent or sibling.
- GitHub-facing text is English-only. Every Issue has `Context`, `Objective` and a testable `Definition of Done`; create it with `gh issue create --body-file <file>`, never with an inline multi-line body, and search open and closed Issues across Fortemate repositories for duplicates first. Every actionable Issue (never a pull request) belongs to the organization Project [Fortemate Engineering](https://github.com/orgs/fortemate/projects/1); triage (Type, `Execution tier`, `Status`, `Priority`, labels, relationships, assignee) and the mandatory read-back after every mutation follow the `github-issue-workflow` skill in `fortemate-internal/skills/`.
- `jules` is a live execution trigger, not a label. Jules, Antigravity, CI, delegated subagents and any agent without the current user's explicit task-scoped authorization never apply, reapply or remove it. Dispatch qualification, monitoring, feedback (only a submitted comment starting with `@jules`; every other comment by the triggering user wakes the session too), takeover, the audit-marker rule for closed Issues and the "no bare `#N` in a spec" rule are the `jules-delegation` skill; a repository must pass the `jules-repo-readiness` skill before its first dispatch.
- The human owner reviews, approves and merges pull requests. Agents never merge pull requests or execute releases.

<!-- /dc-shared:issue-management -->

## Security and operational boundaries

<!-- dc-shared:security v3 — keep identical across Fortemate repositories -->

- Never print, log, or commit secrets. Local secrets live only in gitignored files
  (e.g. `.env.local`, `mise.local.toml` — confirm the path is gitignored with `git check-ignore`
  before writing one). Never bypass Git hooks (`--no-verify`).
- Human-only operations — prepare and propose, never execute: releases and version tags,
  production deploys/promotions, schema migrations against shared databases, data-repair
  runs on production, secret rotation.
- Never add private infrastructure details (hostnames, IP addresses, cloud identifiers,
  topology, credentials, tokens) to code, docs, commits, or PRs — regardless of the
  repository's visibility. A private repository is not a safe place for them either;
  operator-specific details belong in an approved private runbook.

<!-- /dc-shared:security -->
