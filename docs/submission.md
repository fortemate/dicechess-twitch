# Submission checklist

Status: prepared draft, October 25, 2026. Local application/QA and English draft materials
exist. Real broadcaster consent, live human-game/OBS evidence, recorded demo, judge access and
Submitted confirmation remain unverified. See the [judging package](judging/README.md).

Package task: [fortemate/dicechess-twitch#10](https://github.com/fortemate/dicechess-twitch/issues/10). Owner action: [fortemate/dicechess-twitch#11](https://github.com/fortemate/dicechess-twitch/issues/11).

## Dates

- Build/submission window: October 23-November 2, 2026.
- Package ready: November 1, internal target.
- Owner submission target: November 2 at 22:00 Europe/Riga.
- Official deadline: November 2 at 14:00 Pacific Time; see the timezone discrepancy note in the
  [delivery plan](delivery-plan.md).
- Judging: November 5-15. Keep the judged revision and required access available through November 15.
- TwitchCon attendance is not required for entry or the monetary prize. No travel is planned here.

## Before the owner submits

- [ ] Owner confirms Devpost registration for this event; record verified status separately.
- [ ] Enter as an eligible individual or team of individuals, not as a company/legal entity.
      A Fortemate repository/brand does not replace the individual entrant's identity.
- [ ] Run the clean-checkout instructions and complete real Twitch broadcast QA.
- [x] Prepare an [English description draft](judging/description.en.md) covering features, audience
      interaction and actual Codex use; owner review and live-evidence updates remain.
- [ ] Distinguish pre-existing engine/components from the new work built during the submission window.
- [ ] Record all source/component/asset provenance and include everything needed to run legally.
- [x] Record the [actual primary implementation session](judging/session.md):
      `01a1700a-00aa-7711-8dd4-530c8182d2ac`, verified from matching desktop/session metadata.
      Cross-check that same chat before entering the final form.
- [ ] Prepare an under-three-minute demo showing the project working on Twitch and development
      with Codex. The [2:40 shot/narration plan](judging/demo.en.md) is prepared; actual footage
      remains missing. Confirm footage/music/participant permissions before publication.
- [ ] Capture useful Codex development footage during implementation, not only at the end. Make
      the audience choice, its execution and the streamer's response understandable within the demo;
      judges may evaluate only the submitted description, images and video without installing it.
- [ ] Owner publishes the demo to YouTube with viewing access that meets the official rules.
      The organizer FAQ explicitly accepts unlisted YouTube videos; private videos are inaccessible.
- [ ] Owner decides repository visibility and confirms the current judging-contact access route.
      The rules permit a private GitHub/GitLab repository shared with the specified judging contact;
      verify the contact on the live rules page rather than copying an unverified address.
- [ ] Verify all form fields, repository/video links and testing instructions from the judge's
      perspective. A saved draft is not a submitted entry.
- [ ] Owner clicks Submit before the deadline and records Submitted status/confirmation and timestamp.
- [ ] Record the judged commit and preserve required code/materials/testing access through judging.
- [ ] At the submission deadline, freeze the submitted repository, video and linked materials until
      winners are announced. Continue development in a separate copy, as the FAQ instructs; a pinned
      commit alone is not a substitute for that instruction. Before the deadline, edits remain allowed.
- [ ] Check the rules' financial/preferential sponsor-support exclusion against the provenance of
      any reused component. Prior participation in another hackathon alone does not establish that
      support occurred; do not assume either funding or eligibility without evidence.

Publishing media, changing repository visibility, inviting outside collaborators and submitting the
entry are owner actions in the final task. The present planning task does not perform them.

## Scope statement for the description

The established open-source Dice Chess Engine is a dependency. The new project creates the
streamer-versus-chat interaction, three-choice candidate presentation, Twitch connection, voting,
OBS scene and local session/recovery behavior. Do not describe historical engine development as
work created during this hackathon or claim untested audience impact.

## Judging and practical resources

The four criteria have equal weight: idea/innovation, streamer/community impact, technical
implementation including Codex use, and design/watchability. Innovation is the first tie-breaker.
Our practical emphasis is a clearly demonstrated audience decision between understandable plans,
not search-strength claims unsupported by this project's evidence.

- [Official Node.js chatbot starter](https://dev.twitch.tv/docs/chat/chatbot-guide/) runs locally
  with EventSub WebSockets, matching the proposed transport. Treat it as a starter, not a complete
  reconnect/recovery implementation. The FAQ permits starter templates.
- The FAQ warns that Extension review can take 5-14 days; chat and an OBS scene keep approval
  outside this MVP's critical path.
- [TwitchDev Discord](https://discord.com/invite/G8UQqNy), channel `#codex-twitchcon-hackathon`, is
  the organizer-referenced support/community route. Replies may take a business day or two.
- [Participant raid-swap proposal](https://twitchcon-codex.devpost.com/forum_topics/45671-raid-swap-real-twitch-raids-for-everyone-s-demo-footage)
  offers mutual test streams/chatters before November 1. It may help recruit real viewers for
  rehearsal; raids are not required by our MVP or the rules. No participant has been contacted.

## Sources checked October 25, 2026

- [Official rules](https://twitchcon-codex.devpost.com/rules): new work, permitted open-source
  foundation, Twitch connection, code/testing access, demo, Codex session and English materials.
- [Organizer FAQ](https://twitchcon-codex.devpost.com/resources): submission workflow and practical
  guidance. Where wording or timezone conversions conflict, keep the stricter official requirement
  and submit ahead of time.
- [Forum index](https://twitchcon-codex.devpost.com/forum_topics): both currently visible topics
  were read. Raid swap is a participant proposal; the second topic asks about two entries. Neither
  had comments or an organizer clarification at the time of review. These are not new official rules.
