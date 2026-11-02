# Twitch Plays Dice Chess

## One streamer. One chat. Three complete plans.

Twitch Plays Dice Chess turns chat into the streamer's opponent. In the demo, a
real Twitch vote selects a plan that sends a knight across the board and
captures the streamer's queen. The host executes the whole plan, then hands the
board back to the streamer.

Dice Chess uses familiar pieces, but dice specify which piece types can move.
One turn can contain several moves; capturing the opposing king wins. The
streamer chooses legal moves freely. Chat chooses between up to three complete
plans from the same roll.

## Why complete plans?

Voting on the first move of a multi-move turn hides what happens next. Counting
free-form suggestions also makes it hard for a viewer to know what the group is
actually choosing.

Each option therefore shows its final-position board, numbered move list and
capture summary. Animated previews play the alternatives and restore the
original board before voting opens. Viewers can compare consequences without
entering chess notation. The design goal is a decision that is easy to follow
and fun to watch; audience engagement has not yet been measured.

## What streamers and viewers do

The streamer runs the local application, connects their Twitch channel and adds
a read-only browser scene to OBS. Viewers vote in the actual channel with
`!vote 1`, `!vote 2` or `!vote 3`. Each viewer gets one equal vote and can
change it until the deadline. The winning complete turn plays automatically.

No votes means an explicit operator extension, not an invented audience choice.
A roll with no legal action passes visibly. One retained meaningful plan plays
automatically after preview; the application never pads the ballot with fake
alternatives. This is a local streaming application, not a Twitch Extension.

## How I built it with Codex

I directed product scope, reviewed the results and tested the broadcaster
workflow. In the primary Codex chat, we built the candidate adapter, session
host, Twitch authorization/EventSub transport, vote collection, previews, OBS
scene and durable recovery.

The difficult parts were preserving complete-turn legality, deduplicating
resulting rule states instead of reordered move lists, and keeping one host in
charge of timers and execution. Real rehearsal also exposed connection timing
and operator-control issues. Codex helped trace chat events, fix those paths and
run the checks. The video includes genuine later Codex review/test work, rather
than a recreated implementation scene.

Codex is the development tool. Gameplay does not call an LLM or require an
OpenAI API key.

## Implementation and existing foundation

TypeScript on Node.js owns the board, frozen roll, candidates, preview cursor,
voting deadline and execution. Workers use the existing public
`@fortemate/dicechess-engine` 0.14.9 for rules and search. That engine is not
claimed as new hackathon work; this application's Twitch interaction,
presentation and session orchestration were built during the event.

Twitch public-client device authorization and an EventSub WebSocket subscription
to `channel.chat.message` supply actual chat. Access is chat-read only. OAuth
material stays in host memory, outside broadcast snapshots and saved games. OBS
receives a separate read-only scene. Restart restores saved play paused;
interrupted polls discard partial votes and require explicit resumption.

Source is AGPL-3.0-only. The cburnett SVG pieces retain GPL-3.0-or-later
notices; Fortemate branding has a separate bundled notice. Provenance is
documented in the public repository.

## Try it and check the evidence

Watch the [English 2:39 demo](https://youtu.be/sJgxRbO8JU0), then follow the
[public repository's run guide](https://github.com/fortemate/dicechess-twitch/blob/main/docs/judging/run.md).
The demonstrated application revision is
`d055ab79248536fd2be01b05e4973c6b2011f5cc`. Use Node.js 24.22.1 and npm 11.19.1.
Local play and previews need no Twitch credentials; connecting your own channel
requires registering a public Twitch application and personally approving
read-only access. No private packages or models are required.

A clean public clone passed 80 Node tests, 14 Chromium scenarios and two
complete games with real engine workers and fixture Twitch traffic. Real
rehearsal separately verified broadcaster authorization, incoming chat, an
accepted vote, automatic complete-turn execution and OBS output in Twitch
playback. In the demo, option 2 wins 0–1–0: the knight moves f5–e3–d1, capturing
the queen, and the king moves d7–c8.

## Limits and next steps

Live evidence is a single-account rehearsal, not independent multi-viewer play.
Fixture tests cover vote changes, duplicate delivery, deadlines and recovery;
broader real-service failure tests, load and community impact remain unverified.
Candidate search is bounded and does not promise the globally best three plans.
Stream delay varies and late untagged commands cannot identify an earlier
intended round. The application supports one local game/channel; hosted
multi-channel service and click-to-vote Extensions are future work.
