# Third-party artwork

The chessboards, candidate miniatures and dice use the **cburnett** chess piece
SVGs by **Colin M. L. Burnett**, distributed here under **GPL-3.0-or-later**.
The application source remains AGPL-3.0-only; this notice preserves the
artwork's separate license.

The twelve files are copied without modification from the public
[Fortemate web play client](https://github.com/fortemate/dicechess-play/tree/8d8fc177c8ccff45246192f62585112b1a164d58/static/pieces/cburnett).
They are also byte-identical to the SVGs embedded in Chessground 10.1.1. No
Chessground runtime is included.

- [Upstream attribution and license](https://github.com/lichess-org/lila/blob/master/COPYING.md)
  lists cburnett under GPL-2.0-or-later; this distribution chooses version 3 or
  later.
- [Bundled notice](src/client/pieces/cburnett/NOTICE.txt)
- [Bundled GPLv3 text](src/client/pieces/cburnett/LICENSE.txt)
- [SHA-256 hashes of the unmodified artwork](docs/chess-artwork-sha256.json)

Both local surfaces provide a **Pieces: cburnett** link to the bundled notice.
SVGs and notices are served locally from an explicit allowlist; viewing the
board does not require an external image host. Plain board colors match the web
client: light `#f0d9b5`, dark `#b58863`.
