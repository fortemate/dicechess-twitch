# Repository checks and service setup

The configuration follows the public Dice Chess Engine's conventions, adapted to
this Node/TypeScript application. Configuration files prepare an integration;
they do not prove that a GitHub app is installed or a remote analysis succeeded.

## Existing checks

`Application checks / check` runs formatting, strict TypeScript, build, Node
tests and Chromium scenarios. It uses read-only repository permission and no
service credentials. It also runs on fork and Dependabot PRs, subject to
GitHub's approval policy for outside contributors.

GitHub CodeQL default setup was verified configured on October 25, 2026 for
JavaScript/TypeScript and Actions with weekly scans. Keep that managed setup;
there is no competing CodeQL workflow here. Secret scanning, push protection and
private vulnerability reporting were also verified enabled. These are repository
settings, not guarantees about future findings or their resolution.

## Dependabot and dependency review

`.github/dependabot.yml` checks Actions every Tuesday and root npm dependencies
every Wednesday at 08:00 Europe/Riga. Development minor/patch version updates
are grouped; the engine and major tool updates remain separate. `@types/node`
major version updates wait for the coordinated Node/npm migration. No PR is
automatically approved or merged.

After merge, inspect **Insights → Dependency graph → Dependabot** for the first
successful update job. The file enables scheduled version updates; security
update PRs additionally require **Settings → Advanced Security → Dependabot
security updates**. That setting was disabled when checked October 25, 2026 and
was not changed by this preparation. Enable it as the owner and confirm the
dependency graph/alerts are active. Existing vulnerabilities and version updates
have different triggers; a weekly schedule is not a security SLA.

`Dependency review / Review dependency changes` rejects newly introduced
high/critical vulnerabilities on PRs to `main`. It uses GitHub's dependency
comparison with read-only permission; it does not execute package scripts or
post comments. It is not a complete audit of unchanged dependencies.

## CodeRabbit

Install/enable the CodeRabbit GitHub app for this repository. The root
`.coderabbit.yaml` follows the engine's assertive, English, manual-review
policy: automatic reviews and draft reviews are disabled, with summaries/poems
reduced. Use `@coderabbitai review` on a PR after installation and verify the
returned review. Only the owner should request that external review. If
automatic review is desired later, change `reviews.auto_review.enabled`
deliberately in a PR.

Instructions focus on complete-turn legality, host authority, persistence,
credential boundaries, chat-safe controls and honest fixture evidence. Generated
assets and lockfile diffs are filtered; dependency review still checks changes
to the dependency graph. CodeRabbit comments are advisory; they cannot merge.

## SonarQube Cloud

`sonar-project.properties` defines the public project key
`fortemate_dicechess-twitch` in organization `fortemate`, following the engine's
naming convention. The owner must confirm this identity during import; no remote
project creation or account consent is performed by the configuration.

1. Import this repository into that SonarQube Cloud organization and verify the
   project key. Disable Automatic Analysis for the project when using this
   CI-based workflow, so there is one analysis route.
2. Provision a project-appropriate analysis token directly as the GitHub Actions
   repository secret `SONAR_TOKEN`. Never paste it into an issue, file or chat.
3. Set the GitHub Actions repository variable `SONAR_ENABLED` to `true`.
4. After merging, run **SonarQube analysis** from `main` or push an ordinary PR
   from this repository. Verify the uploaded revision, PR decoration and quality
   gate in SonarQube Cloud. A green scanner job is not proof of a passed gate.

The scan uses a pinned official action and full Git history. It does not execute
the app, install npm packages or pass the token to the application test job.
Fork and Dependabot PRs skip this credentialed workflow; normal application,
dependency and managed CodeQL checks remain available. Manual dispatch from a
feature branch is skipped to avoid attributing branch code to `main`.

No LCOV producer currently exists in this project. The configuration supplies no
fictional coverage path and excludes no application files merely to improve
coverage. Establish real source-mapped coverage before treating a coverage gate
as satisfied. No remote Sonar analysis or gate result is claimed by this setup.

## Ownership and branch rules

`CODEOWNERS` names `@rabestro`. Native Issue forms provide the required
structure and type, and the PR template records verification/limits. Maintainers
still assign Issues and manage organization Project fields; the templates grant
no permissions and do not trigger Jules.

Review branch rules after the first successful runs. Require application checks
and dependency review, retain owner approval and block force pushes/deletion of
`main` as appropriate. Add service-specific required checks only once their
activation and fork/Dependabot behavior are understood. Do not enable auto-merge
or allow bot approvals as a substitute for owner review. This PR changes no
repository access, branch rules or external-service installation.

In **Settings → Actions → General**, prefer read-only default workflow
permissions and disable Actions creating/approving PRs unless a reviewed
workflow needs that capability. These workflows declare their permissions
explicitly; no repository-wide write default is required for them.

## References

- [CodeRabbit configuration](https://docs.coderabbit.ai/reference/configuration)
- [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [Dependency review action](https://github.com/actions/dependency-review-action)
- [SonarQube Cloud with GitHub Actions](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/ci-based-analysis/github-actions-for-sonarcloud)
