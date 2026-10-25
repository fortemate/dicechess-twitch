# Judge run guide — draft build and access pending

Repository:
[fortemate/dicechess-twitch](https://github.com/fortemate/dicechess-twitch). It
was verified private on October 25, 2026; judge access and a final judged commit
are not yet confirmed. The owner must choose/review that revision and provide
access before treating this as a ready package. `main` currently holds planning;
until merge, the prepared review branch is `docs/judging-package`.

## Local install and checks

Prerequisites: Git/repository access, Node.js **24.22.1**, npm **11.19.1** and
network access to the public npm registry. The application runs on the local
machine; it needs no private Fortemate registry/model, paid game account or
OpenAI API key. See [development](../development.md) for mise setup and actual
platform/check evidence.

```sh
git clone git@github.com:fortemate/dicechess-twitch.git
cd dicechess-twitch
# Review branch until the owner merges/selects the judged revision:
git switch docs/judging-package
mise trust
mise install
mise exec -- npm ci
mise exec -- npm run check
mise exec -- npx playwright install chromium
mise exec -- npm run test:browser
mise exec -- npm run dev
```

If using the exact runtime without mise, omit its wrapper. Open operator
`http://127.0.0.1:4310/` and read-only scene `http://127.0.0.1:4311/`. Start a
fresh local game or explicitly resume the saved paused game. Streamer board play
and candidate previews can be inspected before Twitch is configured.
Multiple-choice voting waits for a healthy real connection.

For Twitch operation, the broadcaster uses a registered public application ID
and approves read-only chat access through the operator page. The complete
[connection setup](../twitch-connection.md) describes the flow; no access or
refresh token is supplied to a judge, file or browser snapshot. Launch with the
public ID as shown there. The registered ID/channel setup and live rehearsal
remain owner steps; no fake configured value is presented as ready.

Use the read-only URL as an OBS Browser Source at 1920×1080. The separate
[fixture command](../broadcast-rehearsal.md#rare-cases-in-a-separate-fixture-session)
uses ports 4410/4411, fixed dice and no real Twitch connection. It may check
rare mechanics, but cannot prove the live demo.

## Limits relevant to testing

- One installed broadcaster channel and one local game; both listeners bind
  loopback. Operator actions do not exist on the OBS listener.
- Up to three distinct retained complete turns. Bounded sampling/common equity
  estimation does not guarantee a global top three, and weak/missing choices are
  not padded. King capture ends the game.
- Default polling is 30 seconds after host preview. Actual stream-delay
  usability has not been observed; source/receipt/deadline admission has zero
  grace and untagged commands have cross-round intent ambiguity.
- EventSub loss discards the interrupted vote. Recovery requires a healthy
  connection and explicit resume with unchanged choices/dice. Process restart
  requires fresh Twitch authorization; credentials are not persisted.
- The CLI saves committed game/history/decision state locally; saving failure
  rolls back and pauses. See [recovery](../recovery.md) for file/lock limits and
  explicit retry. Browser tests isolate their checkpoint from the owner game.
- macOS clean-clone and Linux CI evidence exist. Windows storage/font behavior
  and compressed real-stream readability are unverified.

## Source and evidence boundary

The [provenance inventory](../provenance.md) identifies the existing public AGPL
engine and pinned dependencies. This repository's application code and
CSS/text/system-font visuals are new work; no private TV assets, trained
weights, voices, music or private infrastructure are required. Keep notices with
source/distribution as applicable.

Local automated results and the built-process restart report are available. The
[live report template](../rehearsal-report-template.md) is unfilled, the demo is
unrecorded and neither YouTube access nor final Submitted status is verified.
The owner completes [the final checklist](../submission.md), including the
organizer-designated private-repository access route, before submission.
