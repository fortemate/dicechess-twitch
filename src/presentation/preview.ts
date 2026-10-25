import type { Game } from '../host/game.ts';
import type { PublicPreview } from '../shared/presentation.ts';
import { presentChoices } from './sequence.ts';
import type { PreviewFrame } from './sequence.ts';

interface Options {
  game: Game;
  changed: () => void;
  stepMs?: number;
}
export class Preview {
  #options: Options;
  #state: PublicPreview = {
    phase: 'idle',
    roundId: null,
    option: null,
    step: 0,
    totalSteps: 0,
    dfen: null,
    from: null,
    to: null,
    caption: '',
    choices: [],
  };
  #frames: PreviewFrame[] = [];
  #cursor = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;
  constructor(options: Options) {
    this.#options = options;
  }
  snapshot(): PublicPreview {
    return structuredClone(this.#state);
  }
  ready(roundId: string) {
    return this.#state.phase === 'complete' && this.#state.roundId === roundId;
  }
  observe() {
    if (this.#disposed) return;
    const game = this.#options.game.snapshot();
    if (game.roundId !== this.#state.roundId) {
      this.#clear();
      this.#state = {
        phase: 'idle',
        roundId: game.roundId,
        option: null,
        step: 0,
        totalSteps: 0,
        dfen: null,
        from: null,
        to: null,
        caption: '',
        choices: [],
      };
      this.#frames = [];
      this.#cursor = 0;
    }
    if (game.phase !== 'preview') {
      this.#clear();
      return;
    }
    if (!game.roundId || !game.rolledDfen || !game.choices.length) return;
    if (this.#state.phase === 'idle') {
      try {
        const presentation = presentChoices(game.rolledDfen, game.choices);
        this.#frames = presentation.frames;
        this.#state = {
          ...this.#state,
          phase: 'showing',
          choices: presentation.choices,
          ...this.#frames[0]!,
        };
      } catch {
        this.#state.caption =
          'Preview unavailable. Resume to retry the saved choices.';
        this.#options.game.pause();
        return;
      }
    }
    if (this.#state.phase === 'complete' || this.#timer) return;
    const roundId = game.roundId;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      const current = this.#options.game.snapshot();
      if (
        this.#disposed ||
        current.phase !== 'preview' ||
        current.roundId !== roundId
      )
        return;
      this.#cursor++;
      const frame = this.#frames[this.#cursor];
      if (frame) this.#state = { ...this.#state, ...frame };
      else
        this.#state = {
          ...this.#state,
          phase: 'complete',
          option: null,
          dfen: current.rolledDfen,
          from: null,
          to: null,
          caption: 'Preview complete · Original position restored',
        };
      this.#options.changed();
      this.observe();
    }, this.#options.stepMs ?? 900);
  }
  #clear() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }
  dispose() {
    this.#disposed = true;
    this.#clear();
  }
}
