# Security policy

Security fixes target the current `main` development line. There is no
maintained stable-release series yet; local MVP checks do not establish
production readiness.

Report vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/fortemate/dicechess-twitch/security/advisories/new).
Do not open a public Issue or PR containing exploit details or credentials. If
private reporting is unavailable, follow the
[Fortemate security policy](https://github.com/fortemate/.github/blob/main/SECURITY.md).

Include the affected commit, environment, impact and a minimal reproduction. Use
redacted examples: never include Twitch access/refresh tokens, activation codes,
operator capabilities or raw chat. Coordinate disclosure with the maintainer
before publishing a confirmed vulnerability.

Both app listeners are local-only. Keep the operator page off stream; capture
the read-only OBS surface. OAuth state is kept in memory, while the saved game
has a separate persistence boundary. See [recovery](docs/recovery.md) and
[connection setup](docs/twitch-connection.md) for current behavior and limits.
