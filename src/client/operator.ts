import type {
  OperatorBootstrap,
  OperatorCommand,
  PublicSnapshot,
} from '../shared/protocol.ts';
import type { OperatorGameState } from '../shared/game.ts';
import { renderBoard } from './board.ts';
import { element, subscribe } from './view.ts';

let snapshot: PublicSnapshot | undefined;
let authority: string | undefined;
let controls: OperatorGameState | undefined;
let connected = false;
let pending = false;
let selected: string | undefined;
let lastPositionVersion = -1;

function ready() {
  return (
    !!authority &&
    connected &&
    !pending &&
    !!controls &&
    !!snapshot &&
    controls.revision === snapshot.revision
  );
}
function updateControls() {
  element<HTMLFieldSetElement>('controls').disabled =
    !authority || !connected || pending;
  element<HTMLFieldSetElement>('game-controls').disabled = !ready();
  const color = element<HTMLSelectElement>('streamer-color');
  color.disabled = !controls?.canStart || !ready();
  if (snapshot && snapshot.game.phase !== 'idle')
    color.value = snapshot.game.streamerColor;
  for (const button of element('promotions').querySelectorAll('button'))
    button.disabled = !ready() || snapshot?.game.phase !== 'streamer-turn';
  for (const [id, enabled] of Object.entries({
    start: controls?.canStart,
    roll: controls?.canRoll,
    pause: controls?.canPause,
    resume: controls?.canResume,
    rematch: controls?.canRematch,
  })) {
    const button = element<HTMLButtonElement>(id);
    button.disabled = !enabled || !ready();
    button.hidden = !enabled;
  }
  if (snapshot)
    renderBoard(element('board'), snapshot.game.dfen, {
      flipped: snapshot.game.streamerColor === 'b',
      click: clickSquare,
      ...(selected ? { selected } : {}),
      actions: controls?.legalActions ?? [],
      disabled: !ready() || snapshot.game.phase !== 'streamer-turn',
    });
}

async function loadControls() {
  try {
    const response = await fetch('/api/operator/state', {
      headers: { 'X-Operator-Request': '1' },
    });
    if (!response.ok) return;
    const next = (await response.json()) as OperatorGameState;
    if (
      snapshot &&
      next.sessionId === snapshot.sessionId &&
      next.revision >= (controls?.revision ?? -1)
    )
      controls = next;
    updateControls();
  } catch {
    /* SSE connection state controls mutating access. */
  }
}

subscribe(
  (next) => {
    if (snapshot && next.sessionId !== snapshot.sessionId) {
      authority = undefined;
      controls = undefined;
      element('feedback').textContent =
        'Host restarted. Reload this operator page.';
    }
    if (next.game.positionVersion !== lastPositionVersion) {
      selected = undefined;
      element('promotions').replaceChildren();
      lastPositionVersion = next.game.positionVersion;
    }
    snapshot = next;
    updateControls();
    void loadControls();
  },
  (live) => {
    connected = live;
    updateControls();
  },
);

try {
  const response = await fetch('/api/operator', {
    headers: { 'X-Operator-Request': '1' },
  });
  if (!response.ok) throw new Error('Operator unavailable');
  const bootstrap = (await response.json()) as OperatorBootstrap;
  authority = bootstrap.capability;
  element('operator-note').textContent = bootstrap.operatorNote;
  updateControls();
  void loadControls();
} catch {
  element('feedback').textContent =
    'Operator unavailable. Reload after the host restarts.';
}

type WithoutIdentity<T> = T extends unknown
  ? Omit<T, 'sessionId' | 'expectedRevision'>
  : never;
type Action = WithoutIdentity<OperatorCommand>;
async function send(action: Action) {
  if (!snapshot || !authority || !connected || pending) return;
  pending = true;
  updateControls();
  element('feedback').textContent = 'Sending to host…';
  try {
    const response = await fetch('/api/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authority}`,
      },
      body: JSON.stringify({
        sessionId: snapshot.sessionId,
        expectedRevision: snapshot.revision,
        ...action,
      }),
    });
    if (response.status === 403) {
      authority = undefined;
      throw new Error('Host restarted. Reload this operator page.');
    }
    if (response.status === 409)
      throw new Error(
        'Action unavailable or session changed. Review the current board.',
      );
    if (!response.ok) throw new Error('Host rejected this command.');
    element('feedback').textContent = 'Published by host';
  } catch (error) {
    element('feedback').textContent =
      error instanceof Error ? error.message : 'Unable to reach host';
  } finally {
    pending = false;
    updateControls();
    void loadControls();
  }
}

function clickSquare(square: string) {
  if (!ready() || !snapshot || snapshot.game.phase !== 'streamer-turn') return;
  const actions = controls?.legalActions ?? [];
  const moves = selected
    ? actions.filter(
        (uci) => uci.startsWith(selected!) && uci.slice(2, 4) === square,
      )
    : [];
  if (moves.length === 1) {
    void send({ action: 'move', uci: moves[0]! });
    return;
  }
  if (moves.length > 1) {
    element('promotions').replaceChildren(
      ...moves.map((uci) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `Promote to ${uci[4]!.toUpperCase()}`;
        button.onclick = () => {
          void send({ action: 'move', uci });
        };
        return button;
      }),
    );
    return;
  }
  selected = actions.some((uci) => uci.startsWith(square)) ? square : undefined;
  element('promotions').replaceChildren();
  updateControls();
}

element<HTMLFormElement>('broadcast-form').addEventListener(
  'submit',
  (event) => {
    event.preventDefault();
    void send({
      action: 'set-message',
      message: element<HTMLInputElement>('message-input').value,
    });
  },
);
element('start').onclick = () => {
  const color = element<HTMLSelectElement>('streamer-color').value;
  if (color === 'w' || color === 'b')
    void send({ action: 'start', streamerColor: color });
};
for (const action of ['roll', 'pause', 'resume', 'rematch'] as const)
  element(action).onclick = () => {
    void send({ action });
  };
