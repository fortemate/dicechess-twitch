import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { subscribe } from '../src/client/view.ts';
import { Session } from '../src/host/session.ts';
import type { PublicSnapshot } from '../src/shared/protocol.ts';
import { threeCandidates } from './voting-fixtures.ts';

test('neutral card labels follow host preview/decision state and transport health survives a repeated revision', async () => {
  const dom = new JSDOM(
    await readFile(new URL('../src/client/obs.html', import.meta.url), 'utf8'),
    { url: 'http://127.0.0.1:4311/' },
  );
  const streams: FixtureStream[] = [];
  class FixtureStream {
    onmessage = (_event: { data: string }) => {};
    onerror = () => {};
    closed = false;
    constructor() {
      streams.push(this);
    }
    emit(snapshot: PublicSnapshot) {
      this.onmessage({ data: JSON.stringify(snapshot) });
    }
    close() {
      this.closed = true;
    }
  }
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    EventSource: FixtureStream,
  };
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  Object.assign(globalThis, globals);
  const session = new Session({
    roll: () => [1, 2, 5],
    candidates: threeCandidates,
    previewStepMs: 60000,
  });
  try {
    session.game.start('b');
    for (let i = 0; i < 30 && session.snapshot().game.choices.length !== 3; i++)
      await new Promise<void>((resolve) => setImmediate(resolve));
    const authoritative = session.snapshot();
    assert.equal(authoritative.game.choices.length, 3);
    subscribe();
    const stream = streams[0]!;
    const preview = structuredClone(authoritative);
    preview.preview.option = preview.game.choices[0]!.option;
    preview.preview.phase = 'showing';
    preview.preview.dfen = preview.game.choices[0]!.resultingDfen;
    preview.game.phase = 'preview';
    stream.emit(preview);
    const doc = dom.window.document;
    assert.equal(doc.querySelector('.choice-state')?.textContent, 'Preview');
    assert.equal(doc.querySelectorAll('.choice-state').length, 1);
    assert.equal(
      doc.getElementById('twitch-status')!.dataset.connected,
      'false',
    );
    assert.equal(doc.getElementById('connection')!.dataset.connected, 'true');

    stream.onerror();
    assert.equal(doc.getElementById('connection')!.dataset.connected, 'false');
    assert.match(
      doc.getElementById('connection')!.textContent!,
      /disconnected/,
    );
    stream.emit(preview);
    assert.equal(doc.getElementById('connection')!.dataset.connected, 'true');
    assert.equal(doc.querySelectorAll('.choice-state').length, 1);

    const paused = structuredClone(preview);
    paused.revision++;
    paused.game.phase = 'paused';
    paused.game.resumePhase = 'preview';
    stream.emit(paused);
    assert.equal(
      doc.querySelector('.previewing .choice-state')?.textContent,
      'Preview',
    );
    assert.equal(doc.querySelectorAll('.previewing').length, 1);
    assert.equal(
      doc.getElementById('board')!.dataset.dfen,
      preview.preview.dfen,
    );

    const unrelatedPause = structuredClone(paused);
    unrelatedPause.revision++;
    unrelatedPause.game.resumePhase = 'streamer-roll';
    stream.emit(unrelatedPause);
    assert.equal(doc.querySelectorAll('.previewing, .choice-state').length, 0);
    assert.equal(doc.getElementById('board')!.dataset.dfen, preview.game.dfen);

    const resumed = structuredClone(preview);
    resumed.revision = unrelatedPause.revision + 1;
    stream.emit(resumed);
    assert.equal(
      doc.querySelector('.previewing .choice-state')?.textContent,
      'Preview',
    );
    const completed = structuredClone(resumed);
    completed.revision++;
    completed.preview.phase = 'complete';
    stream.emit(completed);
    assert.equal(doc.querySelectorAll('.previewing, .choice-state').length, 0);
    assert.equal(doc.getElementById('board')!.dataset.dfen, preview.game.dfen);

    const chosen = structuredClone(completed);
    chosen.revision++;
    chosen.game.phase = 'paused';
    chosen.voting.phase = 'resolved';
    chosen.voting.lastDecision = {
      roundId: chosen.game.roundId!,
      winner: 2,
      counts: [{ option: 2, votes: 1 }],
      leaders: [2],
      selectedIndex: 0,
      seed: 0,
      closedAtMs: 1000,
    };
    chosen.twitch.healthy = true;
    stream.emit(chosen);
    assert.equal(
      doc.querySelector('.chosen .choice-state')?.textContent,
      'Chat choice',
    );
    assert.equal(doc.querySelectorAll('.previewing').length, 0);
    assert.equal(
      doc.getElementById('twitch-status')!.dataset.connected,
      'true',
    );
    assert.equal(
      doc.getElementById('vote-status')!.textContent,
      'Chat chose option 2.',
    );
    assert.equal(
      doc.getElementById('revision')!.textContent,
      String(chosen.revision),
    );
    stream.emit(preview);
    assert.equal(
      doc.querySelector('.chosen .choice-state')?.textContent,
      'Chat choice',
    );
    assert.deepEqual(session.snapshot(), authoritative);
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    assert.equal(stream.closed, true);
  } finally {
    session.dispose();
    dom.window.close();
    for (const key of Object.keys(globals)) {
      const descriptor = previous[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
