import { pieceImagePath } from '../shared/artwork.ts';

const names: Record<string, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

export function renderBoard(
  container: HTMLElement,
  dfen: string,
  options: {
    flipped?: boolean;
    click?: (square: string) => void;
    selected?: string;
    actions?: readonly string[];
    disabled?: boolean;
    marks?: readonly string[];
    coordinates?: boolean;
  } = {},
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
  const children: HTMLElement[] = [];
  for (let visible = 0; visible < 64; visible++) {
    const index = options.flipped ? 63 - visible : visible;
    const row = Math.floor(index / 8);
    const file = index % 8;
    const square = `${String.fromCharCode(97 + file)}${8 - row}`;
    const piece = squares[index] ?? '.';
    const cell = document.createElement(options.click ? 'button' : 'div');
    const target =
      options.selected &&
      options.actions?.some(
        (uci) =>
          uci.startsWith(options.selected!) && uci.slice(2, 4) === square,
      );
    cell.className = `square ${(row + file) % 2 ? 'dark' : 'light'}${options.selected === square ? ' selected' : ''}${target ? ' target' : ''}`;
    if (options.marks?.includes(square)) cell.classList.add('trace');
    cell.dataset.square = square;
    const image = pieceImage(piece);
    if (image) cell.append(image);
    if (options.coordinates !== false) {
      if (visible >= 56) cell.append(coordinate(square[0]!, 'file'));
      if (visible % 8 === 0) cell.append(coordinate(square[1]!, 'rank'));
    }
    cell.setAttribute(
      'aria-label',
      `${square}${piece === '.' ? ' empty' : ` ${piece === piece.toUpperCase() ? 'white' : 'black'} ${names[piece.toLowerCase()]}`}`,
    );
    if (cell instanceof HTMLButtonElement) {
      cell.type = 'button';
      cell.disabled = options.disabled ?? false;
      cell.onclick = () => options.click?.(square);
    }
    children.push(cell);
  }
  container.replaceChildren(...children);
  if (focused)
    container
      .querySelector<HTMLElement>(`[data-square="${focused}"]`)
      ?.focus({ preventScroll: true });
}

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

function coordinate(text: string, kind: 'file' | 'rank'): HTMLElement {
  const label = document.createElement('span');
  label.className = `coordinate coordinate-${kind}`;
  label.textContent = text;
  label.setAttribute('aria-hidden', 'true');
  return label;
}

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
