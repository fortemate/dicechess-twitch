import type { CandidateChoice } from '../engine/types.ts';
import type { PublicGame } from '../shared/game.ts';
import type { PresentedChoice, PresentedMove } from '../shared/presentation.ts';
import type { PublicSnapshot } from '../shared/protocol.ts';
import { renderBoard, renderDice } from './board.ts';

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
    previewing: showing,
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

function playerName(side: string | null, game: PublicGame) {
  return side === game.streamerColor ? 'Streamer' : 'Chat';
}

function lastTurnText(game: PublicGame): string {
  const last = game.lastTurn;
  if (!last) return '';
  const player = playerName(last.side, game);
  if (last.reason === 'forced-pass')
    return `${player}: forced pass — no legal move for that roll`;
  const option = last.option ? `option ${last.option} · ` : '';
  const automatic =
    last.reason === 'single-choice'
      ? 'auto-played the sole retained choice · '
      : '';
  return `${player}: ${option}${automatic}${last.moves.join(' · ')}`;
}

function sideText(game: PublicGame): string {
  if (game.phase === 'idle') return 'No game started';
  if (game.phase === 'game-over')
    return `${playerName(game.winner, game)} wins`;
  return `${playerName(game.dfen.split(' ')[1]!, game)} to play`;
}

function voteStatusText(snapshot: PublicSnapshot): string {
  const voting = snapshot.voting;
  const seconds = Math.ceil(voting.remainingMs / 1000);
  switch (voting.phase) {
    case 'open':
      return `Vote now: !vote 1–${snapshot.game.choices.length} · ${seconds}s · ${voting.totalVoters} voters`;
    case 'waiting':
      return 'No votes received. Waiting for the operator to extend this vote.';
    case 'paused':
      return `Vote paused · ${seconds}s saved · ${voting.totalVoters} voters`;
    case 'preview':
      return snapshot.twitch.healthy
        ? 'Review the frozen choices. Voting opens after preview.'
        : 'Choices ready. Connect Twitch before voting can open.';
    case 'resolved':
      if (voting.lastDecision)
        return `Chat chose option ${voting.lastDecision.winner}.`;
      return 'No vote open';
    default:
      return 'No vote open';
  }
}

function moveText(uci: string, described?: PresentedMove): string {
  if (!described) return uci;
  const promotion = described.promotion ? ` = ${described.promotion}` : '';
  return `${described.label.split(' · ')[0]}${promotion}`;
}

function moveList(choice: CandidateChoice, presentation?: PresentedChoice) {
  const moves = document.createElement('ol');
  moves.className = 'move-summary';
  for (const [index, uci] of choice.moves.entries()) {
    const move = document.createElement('li');
    move.textContent = moveText(uci, presentation?.moves[index]);
    moves.append(move);
  }
  return moves;
}

function choiceCard(
  choice: CandidateChoice,
  snapshot: PublicSnapshot,
  previewing: boolean,
) {
  const card = document.createElement('div');
  card.className = 'choice';
  if (snapshot.preview.option === choice.option && previewing)
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
  const tally = votes === undefined ? '' : ` · ${votes} votes`;
  title.textContent = `Option ${choice.option}${tally}`;
  const miniature = document.createElement('div');
  miniature.className = 'board mini-board';
  miniature.setAttribute(
    'aria-label',
    `Option ${choice.option} final position`,
  );
  renderBoard(miniature, choice.resultingDfen, {
    flipped: snapshot.game.streamerColor === 'b',
    coordinates: false,
  });
  const presentation = snapshot.preview.choices.find(
    (item) => item.option === choice.option,
  );
  const summary = document.createElement('p');
  summary.className = 'capture-summary';
  summary.textContent = presentation?.summary ?? '';
  const command = document.createElement('span');
  command.className = 'vote-command';
  command.textContent =
    snapshot.game.choices.length === 1
      ? 'Automatic turn'
      : `!vote ${choice.option}`;
  card.append(
    title,
    miniature,
    moveList(choice, presentation),
    summary,
    command,
  );
  if (
    card.classList.contains('chosen') ||
    card.classList.contains('previewing')
  ) {
    const state = document.createElement('span');
    state.className = 'choice-state';
    state.textContent = card.classList.contains('chosen')
      ? 'Chat choice'
      : 'Preview';
    card.append(state);
  }
  return card;
}

function renderSnapshot(snapshot: PublicSnapshot) {
  element('message').textContent = snapshot.message;
  element('storage-status').hidden = snapshot.storage.healthy;
  element('storage-status').textContent = snapshot.storage.healthy
    ? ''
    : 'Saving failed. Gameplay is paused. The operator must retry saving before play can continue.';
  element('twitch-status').textContent =
    `Twitch: ${snapshot.twitch.phase.replaceAll('-', ' ')}`;
  element('twitch-status').dataset.connected = String(snapshot.twitch.healthy);
  element('phase').textContent = snapshot.game.phase.replaceAll('-', ' ');
  element('announcement').textContent = snapshot.game.announcement;
  element('last-turn').textContent = lastTurnText(snapshot.game);
  renderDice(element('dice'), snapshot.game.dice);
  element('side').textContent = sideText(snapshot.game);
  const display = displayBoard(snapshot);
  element('preview-caption').textContent =
    snapshot.game.phase === 'preview' || snapshot.game.resumePhase === 'preview'
      ? snapshot.preview.caption
      : 'Current game position';
  if (document.body.classList.contains('broadcast'))
    renderBoard(element('board'), display.dfen, {
      flipped: snapshot.game.streamerColor === 'b',
      marks: display.marks,
    });
  element('choices').replaceChildren(
    ...snapshot.game.choices.map((choice) =>
      choiceCard(choice, snapshot, display.previewing),
    ),
  );
  element('vote-status').textContent = voteStatusText(snapshot);
  element('revision').textContent = String(snapshot.revision);
  element('session').textContent = snapshot.sessionId;
}

/**
 * Render monotonically ordered public snapshots from the host's event stream.
 * Repeated revisions still restore transport health; callbacks let the operator
 * synchronize its controls without giving the read-only scene command authority.
 */
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
    element('connection').dataset.connected = 'true';
    onConnection?.(true);
    if (
      latest?.sessionId === snapshot.sessionId &&
      latest.revision >= snapshot.revision
    )
      return;
    latest = snapshot;
    renderSnapshot(snapshot);
    onSnapshot?.(snapshot);
  };
  events.onerror = () => {
    element('connection').textContent =
      'Host disconnected · waiting to reconnect';
    element('connection').dataset.connected = 'false';
    onConnection?.(false);
  };
  window.addEventListener('pagehide', () => events.close(), { once: true });
}
