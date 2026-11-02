# Install and test the demonstrated application

The [repository](https://github.com/fortemate/dicechess-twitch) is public. The
[2:39 demo](https://youtu.be/sJgxRbO8JU0) uses application revision
`d055ab79248536fd2be01b05e4973c6b2011f5cc`. Later documentation corrections do
not change that demonstrated application. No private package registry, Fortemate
account, model or OpenAI API key is needed.

## Quick local start

Requires Git, Node.js **24.22.1** and npm **11.19.1**. With
[mise](https://mise.jdx.dev/):

```sh
git clone https://github.com/fortemate/dicechess-twitch.git
cd dicechess-twitch
git checkout d055ab79248536fd2be01b05e4973c6b2011f5cc
mise trust
mise install
mise exec -- npm ci
mise exec -- npm run dev
```

With the pinned Node/npm already active, omit the mise commands and wrapper.
Keep ports **4310** and **4311** free. Both listeners bind to `127.0.0.1`; use
these numeric URLs, rather than `localhost`:

- Operator: <http://127.0.0.1:4310/>
- Read-only broadcast scene: <http://127.0.0.1:4311/>

Choose a streamer color and click **Start game**. When it is your turn, click
**Roll dice**, select a piece, then a highlighted legal destination. Finish all
required moves. On chat's turn, the host rolls once and presents up to three
complete plans. Local board play and previews work without Twitch credentials;
multi-choice voting waits for a healthy Twitch connection. Capture the opposing
king to end the game. Fewer meaningful choices are explained, never fabricated.

The host saves `.local/session.json`. After a restart, reload the operator and
explicitly resume the restored paused game. Preserve this file when diagnosing a
failed restart. See [recovery](../recovery.md) for save/lock failures.

## Real Twitch voting and OBS

Follow the [Twitch connection guide](../twitch-connection.md) to register a
**public** Twitch application. Start the host with its public Client ID:

```sh
TWITCH_CLIENT_ID='<public-client-id>' mise exec -- npm run dev
```

The broadcaster clicks **Connect Twitch** and personally completes Twitch's
authorization. This requests `user:read:chat` only; the application never sends
chat messages. No client secret is required and no judge receives the owner's
credentials. Authorization stays in host memory and must be renewed after a host
restart.

Add `http://127.0.0.1:4311/` to OBS as a **1920 × 1080 Browser Source**. Keep
the operator and activation material off the stream. When the animated previews
finish and voting opens, send `!vote 1`, `!vote 2` or `!vote 3` in the connected
channel. A message sent before opening or received after the deadline does not
count. If no vote arrives, click **Extend empty vote** and send a new vote
during the reopened poll. Each viewer has one equal vote and may change it.

## Repeat the checks

Stop the development process before rebuilding the same output directory.

```sh
mise exec -- npm run check
mise exec -- npx playwright install chromium
mise exec -- npm run test:browser
mise exec -- npm run rehearse:full-game
```

On clean Linux, use `npx playwright install --with-deps chromium` to install the
browser's system libraries too; administrator privileges may be required. The
November 2 [verification](../measurements/judging-2026-11-02.json) passed 80
Node tests, 14 Chromium scenarios and two complete fixture games from a clean
public clone on macOS. GitHub CI checks the pinned runtime on Ubuntu separately.

Browser tests use isolated random ports and temporary/in-memory storage. The
full-game runner uses real public engine workers with fake Twitch, controlled
dice and accelerated timers. Neither authorizes Twitch or touches your saved
operator game. [Rare-case fixtures](../broadcast-rehearsal.md) are separate,
visibly labelled sessions on 4410/4411, not the live demo.

## Practical limits

- One local game and installed broadcaster channel; no hosted multi-channel
  service and no click-to-vote Extension.
- Candidate search is bounded; it does not promise the globally best three
  plans. The engine owns complete-turn legality.
- Default voting lasts 30 seconds after previews. It can be set to 5–120 seconds
  before a round. No stream-latency guarantee is claimed; late untagged commands
  cannot identify the viewer's intended prior round.
- Interrupted votes are discarded. Health recovery and explicit resume replay
  the same saved choices under a fresh round identity.
- Actual live evidence uses one broadcaster account voting. Independent viewers,
  load, audience impact and broader real-service failure recovery remain
  unverified.
- Windows installation/storage and real-device browser behavior are unverified.

See [provenance](../provenance.md),
[third-party notices](../../THIRD_PARTY_NOTICES.md) and the
[submission record](../submission.md) for the existing engine, artwork, license
boundaries and continued judging access.
