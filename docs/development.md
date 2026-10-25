# Local development

The CLI runs one durably saved local game. The operator freely selects legal
streamer moves; both browser surfaces render host snapshots. Legal-tree
preparation and candidate search run in workers. OAuth/EventSub has fixture
checks and host-owned vote collection/timers are implemented. Real broadcaster/
channel verification remains pending; [durable recovery](recovery.md) is
implemented. Host-owned animated previews and final-position miniatures are
implemented. No real secret or configuration file is required for local
board/candidate work.

## Clean start

Use Node.js **24.22.1**, npm **11.19.1** and the committed `package-lock.json`.
The exact runtime is recorded in `.node-version`, `mise.toml` and
`package.json`; `.npmrc` rejects mismatched versions. If you use mise, run
`mise trust` and `mise install` in this directory, then use `mise exec --`
before the npm commands when your shell does not activate mise automatically.

The project enables mise's `activate_aggressive` setting so child npm scripts
also resolve the pinned Node before another Node already on PATH. The build
checks its actual runtime and fails on a version mismatch. Check child-process
resolution with `mise exec -- npm exec -c 'node --version'` if troubleshooting.

```sh
git clone https://github.com/fortemate/dicechess-twitch.git
cd dicechess-twitch
# For an unmerged PR, check out its head branch before installing.
mise trust
mise install
mise exec -- npm ci
mise exec -- npm run check
mise exec -- npm run dev
```

Repository access is required while visibility remains private. Installation
downloads public npm packages; no private registry or token is required. If
managing Node manually, install the exact versions above and omit
`mise exec --`.

The recorded October 25 application baseline `42077d8` is
[PR #38](https://github.com/fortemate/dicechess-twitch/pull/38), including the
operator input, multiple-en-passant checkpoint and failed-worker fixes plus the
complete-game fixture runner. Its CI passed 67 Node and 13 Chromium checks. A
[fresh-checkout fixture report](measurements/integration-local.json) records two
complete games at this exact revision with real engine workers and fake Twitch.
It is separate from real broadcaster/human-game verification. That commit is a
historical verification point, not the final judged revision. For current PR
review, use the integration PR's head; after it is merged, use `main`. The owner
chooses the final judged revision. To reproduce only the recorded baseline,
check out `42077d86d82e96227fd0d20a8b1886157be4ed35` detached before installing;
create a feature branch before editing it.

Development rebuilds `src/` changes and restarts the host. Restart creates a new
process session/authority and restores the committed game paused from
`.local/session.json`. Reload the operator, reconnect Twitch if required and
resume explicitly. Reloading only OBS preserves the host session and preview.
Config/build-script changes require restarting `npm run dev`. Ctrl-C stops both
listeners and releases the checkpoint lock. Ports 4310 and 4311 must be free.
`DICECHESS_STATE_FILE` can select another local checkpoint; preserve existing
state rather than deleting it as a troubleshooting step.

For a built run without file watching:

```sh
npm run build
npm start
```

## Two-page verification

1. Open operator `http://127.0.0.1:4310/` and OBS `http://127.0.0.1:4311/` in
   separate browser tabs.
2. Both show “Live from local host”, the same session ID and revision 0.
3. Set the on-air message to “The chat takes a seat” and publish. Both pages
   must show that message and revision 1. Commands and SSE events come from the
   host.
4. Reload OBS. It must still show revision 1, with no form, button or operator
   note.
5. With a fresh checkpoint, choose the streamer's side and start a game. For a
   restored active game, resume it instead. Roll once, select a piece and
   highlighted destination, and finish all required legal actions. Promotion
   offers every legal piece; castling uses the king's destination. The host
   automatically handles rolls with no playable move.
6. Chat rolls once and the worker prepares choices. A single retained choice is
   explained and auto-played. With Twitch healthy, multiple choices open a
   host-owned poll after preview; without it they remain visible. Pause/resume
   preserves the board, roll and choices.
7. Stop the host. Both pages must show disconnection; operator controls become
   disabled.
8. Restart the host and reload the operator. Both pages show a new session and
   revision 0, with the committed game/roll/history retained and active play
   paused. The new process needs fresh Twitch authorization before resuming a
   previously connected game.

In OBS use a Browser Source URL of `http://127.0.0.1:4311/` at 1920 × 1080.
Chromium verification does not establish real OBS capture or Twitch evidence;
those belong to later rehearsal issues.

For Twitch setup, follow [the connection guide](twitch-connection.md). A public
Client ID and explicit broadcaster consent are needed for a real connection;
fixture tests do not establish that live evidence.

See [presentation](presentation.md) for preview state isolation and the checked
1080p/720p layouts. See [voting](voting.md) for duration controls, exact
commands, late-event admission, empty-poll extension and interruption behavior.

For the real channel and separate fixed-dice rare-case sessions, follow
[broadcast rehearsal](broadcast-rehearsal.md). Those fixtures use ports
4410/4411, never authorize Twitch and do not open the operator's saved game.

## Repeatable checks

```sh
npm run format:check
npm run typecheck
npm test
npm run check
npx playwright install chromium
npm run test:browser
git diff --check
```

`npm test` builds assets and runs Node tests: public engine import/legal-turn
tree, candidate legality/identity/quality/deadlines and worker responsiveness,
game transitions/once-only dice and resolution, shared host/SSE state including
reconnect, OBS route isolation, operator origin/capability/host guards,
stale/repeated commands, input bounds, and public-data projection.
`npm run check` combines formatting, strict TypeScript and those build/tests.
Prettier preserves the inherited planning documents and canonical shared blocks
through explicit exclusions in `.prettierignore`.

The [candidate adapter](candidate-generation.md) is a reusable host module. Run
`npm run --silent bench:candidates` to repeat the recorded synthetic
opening/tactical/high-branching measurements. The local game calls it for chat
turns.

Playwright launches the built host and Chromium. Checks cover operator
publication, the OBS revision, read-only DOM, cross-origin isolation, reload
behavior, the 1920 × 1080 viewport and a real SSE disconnect/reconnect without a
revision change. Game checks click a complete turn through the board, prepare
real-engine chat choices, and verify promotion/castling UI, pause/resume,
uniform square geometry and hidden unavailable controls. Their dice and special
starting positions are explicit test fixtures, not live Twitch evidence. They
save local screenshots to `test-results/` (gitignored). Both default ports must
be free. CI runs the same checks on Ubuntu with the pinned runtime and installs
Chromium's Linux dependencies.

## Earlier scaffold baseline

On October 25, 2026, a clean local Git clone on macOS installed with `npm ci`
under Node.js 24.22.1/npm 11.19.1. `npm run check` passed all seven Node tests,
and `npm run test:browser` passed both Chromium checks. The built host was
launched by the browser suite. A separate `dev` lifecycle check verified initial
state on both ports, a source edit triggering rebuild/new session, and SIGINT
closing both listeners. No actual OBS capture, Twitch connection or gameplay
verification is claimed by this scaffold evidence.

That scaffold evidence predates durable recovery. Current storage/restart and
process-level evidence is recorded in [recovery](recovery.md). Browser checks
use a unique isolated checkpoint and never open the default operator game file.

The candidate follow-up explicitly rechecks the npm child-process runtime.
Earlier macOS npm child scripts could select another Node already on PATH; the
project mise setting and build guard prevent that from silently recurring.

## Local authority and private configuration

Both servers bind only `127.0.0.1`; use the documented numeric addresses, not
`localhost`. OBS serves only its HTML/JS/CSS, `GET /api/snapshot` and
`GET /api/events`. It rejects mutations at the HTTP boundary. The operator page
obtains a process-local capability with a same-origin custom-header request.
Commands also require the exact operator origin and current
session/`controlRevision`. Display `revision` continues to order SSE updates;
chat counters and countdown ticks do not invalidate pending controls. Every
accepted command consumes a control revision. No capability is written to a URL,
disk or logs. This protects browser surfaces, not other processes on the
machine.

The public snapshot is an explicit allowlist and never serializes private
configuration. `.env`, `.env.*`, `mise.local.toml` and `.local/` are gitignored.
The application does **not** load environment/mise configuration files. It loads
only the explicit versioned game checkpoint separately. Twitch uses the public
`TWITCH_CLIENT_ID` launch variable; OAuth tokens remain in host memory. Future
adapters must retain this separation and must not put tokens or raw
chat/configuration into broadcast events or errors.
