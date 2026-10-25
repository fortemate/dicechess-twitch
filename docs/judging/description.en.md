# Twitch Plays Dice Chess — English description draft

## The experience

Twitch Plays Dice Chess gives a streamer and their chat one shared board. The
streamer rolls three dice and freely chooses a complete turn permitted by the
Dice Chess rules. On the chat side, the engine prepares up to three distinct
complete-turn choices from one frozen roll. Viewers see numbered final-position
boards, move/capture summaries and an automatic sequence preview, then choose
with `!vote 1`, `!vote 2` or `!vote 3` in Twitch chat.

Each viewer has one equal-weight vote and can change it until the host closes
the poll. The selected sequence plays automatically and control returns to the
streamer. A roll with no legal action forces a visible pass. One retained choice
is explained and auto-played after preview; no alternatives are fabricated. If
nobody votes, the game visibly waits for the operator to extend the poll.

## How it is built

A local TypeScript/Node.js host owns the board, dice, frozen candidates, poll
deadline and execution cursor. An operator page controls play; a separate
read-only page is captured by OBS. Twitch's installed-broadcaster device flow
and EventSub WebSocket supply normalized chat. Authorization stays in host
memory, outside broadcast state and durable game files.

The host rejects duplicate/stale round results and checkpoints committed
transitions. Restart restores the game paused with its original roll, choices
and next unplayed action. A lost chat round clears partial votes and reopens
under a new identity after health recovery and explicit resume. The candidate
search is bounded and uses a common public equity estimate; it does not claim to
find the globally best three turns.

## What Codex contributed

The owner directed the product scope and rules boundaries in a primary Codex
Desktop thread. Codex inspected the public engine interface and implemented the
candidate adapter/workers, authoritative game, installed Twitch transport,
voting, OBS presentation, durable recovery and focused Node/browser checks. It
also repeated clean-checkout verification and a built-process SIGKILL recovery
rehearsal. Human PR review and real-channel acceptance remain owner steps. Codex
is the development tool; gameplay does not invoke an LLM service or require an
OpenAI API key.

## Existing foundation and current evidence

The public Dice Chess Engine 0.14.9 is an existing AGPL-3.0-only dependency. Its
rules/search are not claimed as new hackathon work. The streamer/chat
application, full-turn candidate selection, presentation, integration and
recovery were created in this repository on October 25, 2026. Assets are
CSS/text and system-font chess glyphs; no TV game assets, voices or music were
copied.

At preparation, a clean local checkout passed 60 Node tests and 11 Chromium
checks, including explicit Twitch fixtures. **Real broadcaster authorization,
human-viewer full-game/OBS timing and the required demo footage are still
unverified.** Keep that distinction until the owner records and reviews the real
rehearsal; no audience-engagement or live-broadcast result is claimed.
