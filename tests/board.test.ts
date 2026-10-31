import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { renderBoard, renderDice } from '../src/client/board.ts';
import { pieceImagePath } from '../src/shared/artwork.ts';

const initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';
let dom: JSDOM;
let board: HTMLDivElement;

beforeEach(() => {
  dom = new JSDOM('', { url: 'http://127.0.0.1:4311/' });
  const window = dom.window;
  Object.assign(globalThis, {
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
  });
  board = document.createElement('div');
  document.body.append(board);
});
afterEach(() => {
  dom.window.close();
});

test('SVG artwork preserves square names and distinguishes white and black pieces', () => {
  renderBoard(board, initial);
  assert.equal(board.children.length, 64);
  assert.equal(board.querySelectorAll('img').length, 32);
  const white = board.querySelector('[data-square="e1"]')!;
  const black = board.querySelector('[data-square="e8"]')!;
  assert.equal(white.getAttribute('aria-label'), 'e1 white king');
  assert.equal(black.getAttribute('aria-label'), 'e8 black king');
  assert.equal(
    white.querySelector('img')!.getAttribute('src'),
    '/pieces/cburnett/wK.svg',
  );
  assert.equal(
    black.querySelector('img')!.getAttribute('src'),
    '/pieces/cburnett/bK.svg',
  );
  for (const image of board.querySelectorAll('img')) {
    assert.equal(image.alt, '');
    assert.equal(image.draggable, false);
    assert.equal(image.getAttribute('aria-hidden'), 'true');
  }
  const empty = board.querySelector('[data-square="e4"]')!;
  assert.equal(empty.getAttribute('aria-label'), 'e4 empty');
  assert.equal(empty.querySelector('img'), null);
});

test('board repaint keeps keyboard focus and image clicks still deliver square input', () => {
  const clicked: string[] = [];
  const options = {
    click: (square: string) => clicked.push(square),
    selected: 'b1',
    actions: ['b1c3'],
    marks: ['e2', 'e4'],
  };
  renderBoard(board, initial, options);
  const knight = board.querySelector<HTMLButtonElement>('[data-square="b1"]')!;
  knight.focus();
  knight.querySelector('img')!.click();
  assert.deepEqual(clicked, ['b1']);
  renderBoard(board, initial, options);
  assert.equal((document.activeElement as HTMLElement).dataset.square, 'b1');
  assert.ok(
    board.querySelector('[data-square="b1"]')!.classList.contains('selected'),
  );
  assert.ok(
    board.querySelector('[data-square="c3"]')!.classList.contains('target'),
  );
  assert.ok(
    board.querySelector('[data-square="e4"]')!.classList.contains('trace'),
  );
  board.querySelector<HTMLButtonElement>('[data-square="c3"]')!.click();
  assert.deepEqual(clicked, ['b1', 'c3']);
  renderBoard(board, initial, { ...options, disabled: true });
  const disabled =
    board.querySelector<HTMLButtonElement>('[data-square="b1"]')!;
  assert.equal(disabled.disabled, true);
  disabled.click();
  assert.deepEqual(clicked, ['b1', 'c3']);
});

test('coordinates follow the displayed orientation and readonly miniatures omit them', () => {
  for (const flipped of [false, true]) {
    renderBoard(board, initial, { flipped });
    assert.equal(
      board.firstElementChild!.getAttribute('aria-label'),
      flipped ? 'h1 white rook' : 'a8 black rook',
    );
    assert.equal(
      board.lastElementChild!.getAttribute('aria-label'),
      flipped ? 'a8 black rook' : 'h1 white rook',
    );
    assert.equal(
      [...board.querySelectorAll('.coordinate-file')]
        .map((x) => x.textContent)
        .join(''),
      flipped ? 'hgfedcba' : 'abcdefgh',
    );
    assert.equal(
      [...board.querySelectorAll('.coordinate-rank')]
        .map((x) => x.textContent)
        .join(''),
      flipped ? '12345678' : '87654321',
    );
    assert.equal(board.querySelectorAll('button').length, 0);
  }
  renderBoard(board, initial, { coordinates: false });
  assert.equal(board.querySelectorAll('.coordinate').length, 0);
  assert.equal(board.querySelectorAll('img').length, 32);
});

test('dice replace old icons with accessible SVGs and clear to an empty-roll indicator', () => {
  renderDice(board, 'PNk');
  assert.deepEqual(
    [...board.querySelectorAll('[role="img"]')].map((x) =>
      x.getAttribute('aria-label'),
    ),
    ['pawn', 'knight', 'king'],
  );
  assert.deepEqual(
    [...board.querySelectorAll('img')].map((x) => x.getAttribute('src')),
    [
      '/pieces/cburnett/wP.svg',
      '/pieces/cburnett/wN.svg',
      '/pieces/cburnett/bK.svg',
    ],
  );
  renderDice(board, 'q');
  assert.equal(board.querySelectorAll('img').length, 1);
  assert.equal(
    board.querySelector('img')!.getAttribute('src'),
    '/pieces/cburnett/bQ.svg',
  );
  renderDice(board, 'X');
  assert.equal(board.querySelectorAll('img').length, 0);
  assert.equal(board.textContent, '—');
  renderDice(board, '');
  assert.equal(board.textContent, '—');
});

test('only single chess piece codes can become an artwork URL', () => {
  for (const value of ['', '.', 'constructor', '../wK', 'K.svg', '<img>', '♔'])
    assert.equal(pieceImagePath(value), undefined);
  for (const piece of 'KQRBNPkqrbnp')
    assert.match(
      pieceImagePath(piece)!,
      /^\/pieces\/cburnett\/[wb][KQRBNP]\.svg$/,
    );
});
