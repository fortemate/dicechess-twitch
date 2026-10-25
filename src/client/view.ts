import type { PublicSnapshot } from '../shared/protocol.ts';
import { renderBoard, diceText } from './board.ts';

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing element: ${id}`);
  return result as T;
}

export function displayBoard(snapshot: PublicSnapshot) {
  const showing =
    snapshot.preview.phase === 'showing' &&
    (snapshot.game.phase === 'preview' ||
      (snapshot.game.phase === 'paused' &&
        snapshot.game.resumePhase === 'preview'));
  return {
    dfen:
      showing && snapshot.preview.dfen
        ? snapshot.preview.dfen
        : snapshot.game.dfen,
    marks: showing
      ? [snapshot.preview.from, snapshot.preview.to].filter(
          (value): value is string => !!value,
        )
      : [],
  };
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
      ? `${last.side === snapshot.game.streamerColor ? 'Streamer' : 'Chat'}: ${last.reason === 'forced-pass' ? 'forced pass — no legal move for that roll' : `${last.option ? `option ${last.option} · ` : ''}${last.reason === 'single-choice' ? 'auto-played the sole retained choice · ' : ''}${last.moves.join(' · ')}`}`
      : '';
    element('dice').textContent = diceText(snapshot.game.dice) || '—';
    element('side').textContent =
      snapshot.game.phase === 'idle'
        ? 'No game started'
        : `${snapshot.game.dfen.split(' ')[1] === snapshot.game.streamerColor ? 'Streamer' : 'Chat'} to play`;
    const display = displayBoard(snapshot);
    element('preview-caption').textContent =
      snapshot.game.phase === 'preview' ||
      snapshot.game.resumePhase === 'preview'
        ? snapshot.preview.caption
        : 'Current game position';
    if (document.body.classList.contains('broadcast'))
      renderBoard(element('board'), display.dfen, {
        flipped: snapshot.game.streamerColor === 'b',
        marks: display.marks,
      });
    const cards = snapshot.game.choices.map((choice) => {
      const card = document.createElement('div');
      card.className = 'choice';
      if (
        snapshot.preview.option === choice.option &&
        snapshot.game.phase === 'preview'
      )
        card.classList.add('previewing');
      if (
        snapshot.voting.lastDecision?.roundId === snapshot.game.roundId &&
        snapshot.voting.lastDecision.winner === choice.option
      )
        card.classList.add('chosen');
      const title = document.createElement('strong');
      const votes = snapshot.voting.counts.find(
        (count) => count.option === choice.option,
      )?.votes;
      title.textContent = `Option ${choice.option}${votes === undefined ? '' : ` · ${votes} votes`}`;
      const miniature = document.createElement('div');
      miniature.className = 'board mini-board';
      miniature.setAttribute(
        'aria-label',
        `Option ${choice.option} final position`,
      );
      renderBoard(miniature, choice.resultingDfen, {
        flipped: snapshot.game.streamerColor === 'b',
      });
      const presentation = snapshot.preview.choices.find(
        (item) => item.option === choice.option,
      );
      const moves = document.createElement('ol');
      moves.className = 'move-summary';
      for (const [index, uci] of choice.moves.entries()) {
        const move = document.createElement('li');
        const described = presentation?.moves[index];
        move.textContent = described
          ? `${described.label.split(' · ')[0]}${described.promotion ? ` = ${described.promotion}` : ''}`
          : uci;
        moves.append(move);
      }
      const summary = document.createElement('p');
      summary.className = 'capture-summary';
      summary.textContent = presentation?.summary ?? '';
      const command = document.createElement('span');
      command.className = 'vote-command';
      command.textContent =
        snapshot.game.choices.length === 1
          ? 'Automatic turn'
          : `!vote ${choice.option}`;
      card.append(title, miniature, moves, summary, command);
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
