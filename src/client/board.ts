const symbols: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};
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
  } = {},
) {
  const placement = dfen.split(' ')[0]!;
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
    cell.dataset.square = square;
    cell.textContent = symbols[piece] ?? '';
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

export function diceText(dice: string): string {
  return [...dice].map((piece) => symbols[piece] ?? piece).join(' ');
}
