# Contributing

Read the [MVP scope](docs/mvp.md), [architecture](docs/architecture.md) and
[development guide](docs/development.md) before changing behavior. Discuss
features and bugs in an issue with Context, Objective and a testable Definition
of Done. Routine docs, CI and maintenance PRs may explain their scope directly.
Issue forms set the native type; maintainers complete Project/priority triage.

Create a branch such as `feat/short-description`, `bug/short-description` or
`ci/short-description`. Keep PRs focused and write GitHub-facing text in
English. Reference related issues; close only those the PR fully completes.
Owner review and merge are required; passing automation does not approve a
change.

Use the exact Node/npm versions in `package.json` and `mise.toml`, install with
`npm ci`, then run:

```sh
mise exec -- npm run check
mise exec -- npm run test:browser
git diff --check
```

Install Chromium with `mise exec -- npx playwright install chromium` first. That
installs browser binaries only. On supported Linux distributions, install the
required system libraries as well, using
`mise exec -- npx playwright install --with-deps chromium`, as CI does. The
system-dependency step may require administrator privileges. See
[Playwright's browser setup](https://playwright.dev/docs/browsers#install-system-dependencies).
The browser suite uses isolated checkpoints; do not test against another
operator's saved game. Add meaningful regressions for behavior changes and
record what was actually checked. Do not call fake chat or accelerated games
live Twitch evidence. See [repository checks](docs/repository-checks.md) for
dependency and review configuration.

Node/npm upgrades are coordinated changes to `package.json`, `.node-version`,
`mise.toml` and the lockfile; Dependabot does not perform that migration. Keep
`@types/node` on the selected runtime major and review engine updates separately
from grouped development tools. Do not enable automatic merging.

Project-authored code and docs use [AGPL-3.0-only](LICENSE); preserve dependency
notices and [provenance](docs/provenance.md). Do not add restricted media,
private models/books/profiles, credentials or raw chat. Report vulnerabilities
using [SECURITY.md](SECURITY.md), not a public issue. Account consent, live
broadcasts, releases, visibility changes and submission remain owner actions.
