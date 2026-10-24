import type { OperatorBootstrap, PublicSnapshot } from '../shared/protocol.ts';
import { element, subscribe } from './view.ts';

const controls = element<HTMLFieldSetElement>('controls');
const messageInput = element<HTMLInputElement>('message-input');
const phaseInput = element<HTMLSelectElement>('phase-input');
let snapshot: PublicSnapshot | undefined;
let capability: string | undefined;
let connected = false;
let pending = false;
function updateControls() {
  controls.disabled = !capability || !connected || pending;
}

subscribe(
  (next) => {
    snapshot = next;
    // Preserve a draft message; snapshots update the separate on-air preview.
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
  capability = bootstrap.capability;
  element('operator-note').textContent = bootstrap.operatorNote;
  updateControls();
} catch {
  element('feedback').textContent =
    'Operator unavailable. Reload after the host restarts.';
}

element<HTMLFormElement>('broadcast-form').addEventListener(
  'submit',
  (event) => {
    event.preventDefault();
    void publish();
  },
);

async function publish() {
  if (!snapshot || !capability || !connected || pending) return;
  pending = true;
  updateControls();
  element('feedback').textContent = 'Sending to host…';
  try {
    const response = await fetch('/api/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${capability}`,
      },
      body: JSON.stringify({
        sessionId: snapshot.sessionId,
        expectedRevision: snapshot.revision,
        phase: phaseInput.value,
        message: messageInput.value,
      }),
    });
    if (response.status === 403) {
      capability = undefined;
      throw new Error('Host restarted. Reload this operator page.');
    }
    if (response.status === 409)
      throw new Error(
        'Session changed. Review the on-air snapshot and try again.',
      );
    if (!response.ok)
      throw new Error(
        'Host rejected the change. Check the message and try again.',
      );
    element('feedback').textContent = 'Published by host';
  } catch (error) {
    element('feedback').textContent =
      error instanceof Error ? error.message : 'Unable to reach host';
  } finally {
    pending = false;
    updateControls();
  }
}
