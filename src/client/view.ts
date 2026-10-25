import type { PublicSnapshot } from '../shared/protocol.ts';

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
    element('phase').textContent =
      snapshot.phase === 'paused' ? 'Paused' : 'Setting up';
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
