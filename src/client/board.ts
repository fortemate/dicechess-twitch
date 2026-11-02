import { pieceImagePath } from '../shared/artwork.ts';

const names: Record<string, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

interface BoardOptions {
  flipped?: boolean;
  click?: (square: string) => void;
  selected?: string;
  actions?: readonly string[];
  disabled?: boolean;
  marks?: readonly string[];
  coordinates?: boolean;
}

function squareLabel(square: string, piece: string) {
  if (piece === '.') return `${square} empty`;
  const color = piece === piece.toUpperCase() ? 'white' : 'black';
  return `${square} ${color} ${names[piece.toLowerCase()]}`;
}

function isTarget(square: string, options: BoardOptions) {
  const selected = options.selected;
  if (!selected) return false;
  return options.actions?.some(
    (uci) => uci.startsWith(selected) && uci.slice(2, 4) === square,
  );
}

function appendCoordinates(cell: HTMLElement, square: string, visible: number) {
  if (visible >= 56) cell.append(coordinate(square[0]!, 'file'));
  if (visible % 8 === 0) cell.append(coordinate(square[1]!, 'rank'));
}

function boardCell(squares: string, visible: number, options: BoardOptions) {
  const index = options.flipped ? 63 - visible : visible;
  const row = Math.floor(index / 8);
  const file = index % 8;
  const square = `${String.fromCodePoint(97 + file)}${8 - row}`;
  const piece = squares[index] ?? '.';
  const cell = document.createElement(options.click ? 'button' : 'div');
  cell.className = `square ${(row + file) % 2 ? 'dark' : 'light'}`;
  if (options.selected === square) cell.classList.add('selected');
  if (isTarget(square, options)) cell.classList.add('target');
  if (options.marks?.includes(square)) cell.classList.add('trace');
  cell.dataset.square = square;
  const image = pieceImage(piece);
  if (image) cell.append(image);
  if (options.coordinates !== false) appendCoordinates(cell, square, visible);
  cell.setAttribute('aria-label', squareLabel(square, piece));
  if (cell instanceof HTMLButtonElement) {
    cell.type = 'button';
    cell.disabled = options.disabled ?? false;
    cell.onclick = () => options.click?.(square);
  }
  return cell;
}

/**
 * Render host-validated DFEN in the requested orientation, retaining square focus.
 * A click callback enables operator input; omitting it produces a read-only board.
 * Rendering never applies moves or changes the authoritative game state.
 */
export function renderBoard(
  container: HTMLElement,
  dfen: string,
  options: BoardOptions = {},
) {
  const placement = dfen.split(' ')[0]!;
  container.dataset.dfen = dfen;
  const squares = placement
    .replace(/\d/g, (count) => '.'.repeat(Number(count)))
    .replaceAll('/', '');
  const focused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset.square
      : undefined;
  container.replaceChildren(
    ...Array.from({ length: 64 }, (_, visible) =>
      boardCell(squares, visible, options),
    ),
  );
  if (focused)
    container
      .querySelector<HTMLElement>(`[data-square="${focused}"]`)
      ?.focus({ preventScroll: true });
}

/** Build decorative SVG artwork; its enclosing square or dice chip owns the label. */
function pieceImage(piece: string): HTMLImageElement | undefined {
  const path = pieceImagePath(piece);
  if (!path) return undefined;
  const image = document.createElement('img');
  image.className = 'piece-image';
  image.src = path;
  image.alt = '';
  image.draggable = false;
  image.setAttribute('aria-hidden', 'true');
  return image;
}

/** Add a visual coordinate without repeating the accessible square name. */
function coordinate(text: string, kind: 'file' | 'rank'): HTMLElement {
  const label = document.createElement('span');
  label.className = `coordinate coordinate-${kind}`;
  label.textContent = text;
  label.setAttribute('aria-hidden', 'true');
  return label;
}

/** Render supplied roll codes as labeled chips, or a dash when no valid code remains. */
export function renderDice(container: HTMLElement, dice: string) {
  const icons = [...dice].flatMap((piece) => {
    const image = pieceImage(piece);
    if (!image) return [];
    const chip = document.createElement('span');
    chip.className = 'piece-die';
    chip.setAttribute('role', 'img');
    chip.setAttribute('aria-label', names[piece.toLowerCase()]!);
    chip.append(image);
    return [chip];
  });
  container.replaceChildren(...icons);
  if (!icons.length) container.textContent = '—';
}
