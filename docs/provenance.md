# Dependencies and provenance

All application HTML, CSS and TypeScript in this scaffold was authored for this
repository during the hackathon window with Codex and is covered by the
repository's AGPL-3.0-only license. The DC text tile and abstract checkerboard
are CSS/text, not copied Fortemate brand artwork. System fonts are used; no
images, voices, music or TV assets are bundled.

Direct npm dependencies are exact-version pinned; `package-lock.json` records
transitive versions, registry locations and integrity hashes. Installed
dependencies retain their own licenses.

| Component         | Version | License       | Source / use                                                                                                                                                                                                                                     |
| ----------------- | ------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dice Chess Engine | 0.14.9  | AGPL-3.0-only | [Public engine](https://github.com/fortemate/dicechess-engine), [npm package](https://www.npmjs.com/package/@fortemate/dicechess-engine); existing pre-hackathon foundation, pinned and smoke-tested only. Not yet connected to the application. |
| TypeScript        | 7.0.2   | Apache-2.0    | [Microsoft/TypeScript](https://github.com/microsoft/TypeScript); type checking                                                                                                                                                                   |
| esbuild           | 0.28.2  | MIT           | [evanw/esbuild](https://github.com/evanw/esbuild); host/browser builds                                                                                                                                                                           |
| Prettier          | 3.9.10  | MIT           | [prettier/prettier](https://github.com/prettier/prettier); formatting                                                                                                                                                                            |
| @types/node       | 24.19.2 | MIT           | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node); Node types                                                                                                                                         |
| @playwright/test  | 1.64.1  | Apache-2.0    | [microsoft/playwright](https://github.com/microsoft/playwright); browser checks                                                                                                                                                                  |

Node.js 24.22.1 and npm 11.19.1 are the pinned runtime/package manager. See
[Node licensing](https://github.com/nodejs/node/blob/v24.22.1/LICENSE) and
[npm licensing](https://github.com/npm/cli/blob/v11.19.1/LICENSE). CI actions
are pinned to commit SHAs from
[actions/checkout](https://github.com/actions/checkout) and
[actions/setup-node](https://github.com/actions/setup-node), both MIT licensed.
Playwright downloads Chromium for tests; the browser is not bundled in
application output.

No source was extracted from Dice Chess TV or another private project. No
private evaluators, weights, books, production profiles, restricted
voice/music/portrait assets or infrastructure configuration were copied. No
claim about sponsor support for existing components is made here.
