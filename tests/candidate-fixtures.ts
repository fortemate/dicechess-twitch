/** New, synthetic rules fixtures; no game corpus or production positions. */
export const fixtures = {
  opening: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 PN',
  maximal: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 QRN',
  tactical: '4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1 QP',
  highBranching: '4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1 QQQ',
  promotion: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1 P',
  castling: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1 KR',
  enPassant: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1 P',
  zero: 'k7/8/8/8/8/8/8/7K w - - 0 1 P',
  one: 'k7/8/8/8/8/P7/8/7K w - - 0 1 P',
  two: 'k7/8/8/8/8/8/3P4/7K w - - 0 1 P',
  kingSafety: 'k7/4r3/8/8/8/8/4R3/4K3 w - - 0 1 R',
} as const;
