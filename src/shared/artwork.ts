/** Bundled, same-origin artwork shared by the operator and read-only scene. */
export const pieceAssetFiles = ['K', 'Q', 'R', 'B', 'N', 'P'].flatMap((piece) =>
  ['w', 'b'].map((color) => `${color}${piece}.svg`),
);

export function pieceImagePath(piece: string): string | undefined {
  if (!/^[kqrbnp]$/i.test(piece)) return undefined;
  const color = piece === piece.toUpperCase() ? 'w' : 'b';
  return `/pieces/cburnett/${color}${piece.toUpperCase()}.svg`;
}
