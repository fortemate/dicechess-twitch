import type { PublicSnapshot } from '../shared/protocol.ts';
import { renderBoard, diceText } from './board.ts';

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing element: ${id}`);
  return result as T;
}

export function subscribe(
  onSnapshot?: (snapshot: PublicSnapshot) => void,
  onConnection?: (connected: boolean) => void,
) {
  let latest: PublicSnapshot | undefined;
  const events = new EventSource('/api/events');
  events.onmessage = (event: MessageEvent<string>) => {
    const snapshot = JSON.parse(event.data) as PublicSnapshot;
    // A reconnect can legitimately repeat the same revision. Restore connection
    // health even when there is no new state to render.
    element('connection').textContent = 'Live from local host';
    onConnection?.(true);
    if (
      latest?.sessionId === snapshot.sessionId &&
      latest.revision >= snapshot.revision
    )
      return;
    latest = snapshot;
    element('message').textContent = snapshot.message;
    element('twitch-status').textContent =
      `Twitch: ${snapshot.twitch.phase.replaceAll('-', ' ')}`;
    element('phase').textContent = snapshot.game.phase.replaceAll('-', ' ');
    element('announcement').textContent = snapshot.game.announcement;
    const last = snapshot.game.lastTurn;
    element('last-turn').textContent = last
      ? `${last.side === snapshot.game.streamerColor ? 'Streamer' : 'Chat'}: ${last.reason === 'forced-pass' ? 'forced pass — no legal move for that roll' : `${last.reason === 'single-choice' ? 'auto-played the sole retained choice · ' : ''}${last.moves.join(' · ')}`}`
      : '';
    element('dice').textContent = diceText(snapshot.game.dice) || '—';
    element('side').textContent =
      snapshot.game.phase === 'idle'
        ? 'No game started'
        : `${snapshot.game.dfen.split(' ')[1] === snapshot.game.streamerColor ? 'Streamer' : 'Chat'} to play`;
    if (document.body.classList.contains('broadcast'))
      renderBoard(element('board'), snapshot.game.dfen, {
        flipped: snapshot.game.streamerColor === 'b',
      });
    const cards = snapshot.game.choices.map((choice) => {
      const card = document.createElement('div');
      card.className = 'choice';
      const title = document.createElement('strong');
      const votes = snapshot.voting.counts.find(
        (count) => count.option === choice.option,
      )?.votes;
      title.textContent = `Option ${choice.option}${votes === undefined ? '' : ` · ${votes} votes`}`;
      const moves = document.createElement('span');
      moves.textContent = choice.moves.join(' · ');
      card.append(title, moves);
      return card;
    });
    element('choices').replaceChildren(...cards);
    const voting = snapshot.voting;
    element('vote-status').textContent =
      voting.phase === 'open'
        ? `Vote now: !vote 1–${snapshot.game.choices.length} · ${Math.ceil(voting.remainingMs / 1000)}s · ${voting.totalVoters} voters`
        : voting.phase === 'waiting'
          ? 'No votes received. Waiting for the operator to extend this vote.'
          : voting.phase === 'paused'
            ? `Vote paused · ${Math.ceil(voting.remainingMs / 1000)}s saved · ${voting.totalVoters} voters`
            : voting.phase === 'preview'
              ? snapshot.twitch.healthy
                ? 'Review the frozen choices. Voting opens after preview.'
                : 'Choices ready. Connect Twitch before voting can open.'
              : voting.lastDecision && voting.phase === 'resolved'
                ? `Chat chose option ${voting.lastDecision.winner}.`
                : 'No vote open';
    element('revision').textContent = String(snapshot.revision);
    element('session').textContent = snapshot.sessionId;
    onSnapshot?.(snapshot);
  };
  events.onerror = () => {
    element('connection').textContent =
      'Host disconnected · waiting to reconnect';
    onConnection?.(false);
  };
  window.addEventListener('pagehide', () => events.close(), { once: true });
}
