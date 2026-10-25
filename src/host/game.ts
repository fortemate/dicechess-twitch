import { randomInt, randomUUID } from 'node:crypto';
import { DiceChess as Rules } from '@fortemate/dicechess-engine/rules';
import type { MoveTree } from '@fortemate/dicechess-engine';
import { generateCandidates } from '../engine/generator.ts';
import { legalTurnTree } from '../engine/legal-turns.ts';
import type {
  RetainedCandidates,
  SavedAnimation,
  SavedGame,
} from './saved-game.ts';
import type { CandidateRequest } from '../engine/types.ts';
import type {
  Color,
  GamePhase,
  OperatorGameState,
  PublicGame,
  TurnRecord,
} from '../shared/game.ts';

export const initialPosition =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface GameOptions {
  changed: () => void;
  sessionId: string;
  roll?: () => readonly number[];
  tree?: typeof legalTurnTree;
  candidates?: typeof generateCandidates;
  initialDfen?: string;
  autoplayDelayMs?: number;
  animationStepMs?: number;
  externalPreview?: boolean;
}

export class Game {
  #options: GameOptions;
  #phase: GamePhase = 'idle';
  #resumePhase: GamePhase | null = null;
  #dfen = initialPosition;
  #positionVersion = 0;
  #gameId: string | null = null;
  #streamerColor: Color = 'w';
  #rolledDfen: string | null = null;
  #roundId: string | null = null;
  #node: MoveTree = {};
  #moves: string[] = [];
  #candidates: RetainedCandidates | undefined;
  #job: AbortController | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #animation: SavedAnimation | undefined;
  #resolvedRounds = new Set<string>();
  #announcement =
    'Start a game. Connect your broadcaster account for chat votes.';
  #winner: Color | null = null;
  #lastTurn: TurnRecord | null = null;
  #pendingPass = false;
  #failed: 'tree' | 'candidates' | 'choices' | 'animation' | undefined;
  #disposed = false;
  #chatUnavailable = false;
  #storageBlocked = false;
  #history: TurnRecord[] = [];
  #startingDfen: string;

  constructor(options: GameOptions) {
    this.#options = options;
    this.#startingDfen = options.initialDfen ?? initialPosition;
  }

  snapshot(): PublicGame {
    return {
      gameId: this.#gameId,
      positionVersion: this.#positionVersion,
      phase: this.#phase,
      resumePhase: this.#resumePhase,
      dfen: this.#dfen,
      streamerColor: this.#streamerColor,
      rolledDfen: this.#rolledDfen,
      dice: this.#rolledDfen?.split(' ')[6] ?? '',
      roundId: this.#roundId,
      choices:
        this.#candidates?.choices.map((choice) => ({
          option: choice.option,
          moves: [...choice.moves],
          resultingDfen: choice.resultingDfen,
        })) ?? [],
      announcement: this.#announcement,
      winner: this.#winner,
      lastTurn: this.#lastTurn
        ? { ...this.#lastTurn, moves: [...this.#lastTurn.moves] }
        : null,
    };
  }

  controls(): Omit<
    OperatorGameState,
    | 'sessionId'
    | 'revision'
    | 'canExtendVote'
    | 'canSetVoteDuration'
    | 'canRetrySave'
  > {
    return {
      legalActions:
        this.#phase === 'streamer-turn' ? Object.keys(this.#node) : [],
      canStart: this.#phase === 'idle' && !this.#storageBlocked,
      canRoll: this.#phase === 'streamer-roll' && !this.#storageBlocked,
      canPause: !['idle', 'paused', 'game-over'].includes(this.#phase),
      canResume:
        this.#phase === 'paused' &&
        !this.#chatUnavailable &&
        !this.#storageBlocked,
      canRematch: this.#phase === 'game-over' && !this.#storageBlocked,
    };
  }

  start(streamerColor: Color): boolean {
    if (!this.controls().canStart && !this.controls().canRematch) return false;
    this.#cancelWork();
    this.#gameId = randomUUID();
    this.#streamerColor = streamerColor;
    this.#dfen = this.#startingDfen;
    this.#positionVersion++;
    this.#winner = null;
    this.#lastTurn = null;
    this.#history = [];
    this.#resolvedRounds.clear();
    this.#resumePhase = null;
    this.#phase = 'idle';
    this.#chatUnavailable = false;
    this.#failed = undefined;
    this.#pendingPass = false;
    this.#animation = undefined;
    this.#beginTurn();
    return true;
  }

  roll(): boolean {
    if (!this.controls().canRoll) return false;
    this.#freezeRoll();
    this.#setPhase('streamer-preparing');
    this.#announcement = 'Checking the complete legal turn tree…';
    this.#changed();
    this.#prepareStreamer();
    return true;
  }

  move(uci: string): boolean {
    if (
      this.#storageBlocked ||
      this.#phase !== 'streamer-turn' ||
      !Object.hasOwn(this.#node, uci)
    )
      return false;
    const next = this.#apply(this.#dfen, uci);
    if (!next) return false;
    this.#dfen = next;
    this.#positionVersion++;
    this.#moves.push(uci);
    this.#node = this.#node[uci]!;
    if (this.#terminal(next)) {
      this.#finishGame('streamer');
      return true;
    }
    if (Object.keys(this.#node).length === 0) this.#finishTurn('streamer');
    else {
      this.#announcement = 'Continue your legal turn.';
      this.#changed();
    }
    return true;
  }

  pause(): boolean {
    if (!this.controls().canPause) return false;
    this.#resumePhase = this.#phase;
    this.#phase = 'paused';
    this.#clearTimer();
    this.#changed();
    return true;
  }

  resume(): boolean {
    if (!this.controls().canResume || !this.#resumePhase) return false;
    this.#phase = this.#resumePhase;
    this.#resumePhase = null;
    if (this.#pendingPass) {
      this.#pendingPass = false;
      this.#failed = undefined;
      this.#finishTurn('forced-pass');
      return true;
    }
    const failed = this.#failed;
    this.#failed = undefined;
    if (failed === 'tree') this.#phase = 'streamer-preparing';
    if (failed === 'choices' || failed === 'animation')
      this.#phase = 'chat-preparing';
    this.#changed();
    if (failed === 'tree') this.#prepareStreamer();
    else if (failed === 'candidates') this.#prepareChat();
    else if (failed === 'choices' || failed === 'animation')
      this.#validateRetained(failed === 'animation');
    else if (this.#phase === 'chat-roll') this.#beginTurn();
    else if (this.#phase === 'chat-animation') this.#scheduleAnimation();
    else this.#scheduleSingle();
    return true;
  }

  /** Internal integration hook. Preview/vote services own when this is called. */
  openVoting(roundId: string): boolean {
    if (
      this.#phase !== 'preview' ||
      roundId !== this.#roundId ||
      (this.#candidates?.choices.length ?? 0) < 2
    )
      return false;
    this.#phase = 'voting';
    this.#announcement = 'Waiting for chat votes.';
    this.#changed();
    return true;
  }

  /** Internal only: no operator HTTP command can choose a winner for chat. */
  resolveChoice(roundId: string, option: number): boolean {
    const automatic =
      this.#phase === 'preview' && this.#candidates?.choices.length === 1;
    if (
      (!automatic && this.#phase !== 'voting') ||
      this.#roundId !== roundId ||
      this.#resolvedRounds.has(roundId)
    )
      return false;
    const set = this.#candidates;
    if (
      !set ||
      set.request.rolledDfen !== this.#dfen ||
      set.request.positionVersion !== this.#positionVersion
    )
      return false;
    const choice = set.choices.find((candidate) => candidate.option === option);
    if (!choice) return false;
    let final = this.#dfen;
    for (let index = 0; index < choice.moves.length; index++) {
      const next = this.#apply(final, choice.moves[index]!);
      if (!next || (this.#terminal(next) && index !== choice.moves.length - 1))
        return false;
      final = next;
    }
    if (!this.#terminal(final)) final = Rules.endTurn(final) ?? '';
    if (!choice.moves.length || final !== choice.resultingDfen) return false;
    this.#resolvedRounds.add(roundId);
    this.#clearTimer();
    this.#announcement = automatic
      ? 'One retained engine choice — playing automatically.'
      : `Chat chose option ${option}.`;
    this.#animation = {
      choice,
      nextIndex: 0,
      reason: automatic ? 'single-choice' : 'chat-choice',
    };
    this.#phase = 'chat-animation';
    this.#changed();
    this.#scheduleAnimation();
    return true;
  }

  dispose() {
    this.#disposed = true;
    this.#cancelWork();
  }

  checkpoint(): SavedGame {
    const set = this.#candidates;
    return structuredClone({
      gameId: this.#gameId,
      startingDfen: this.#startingDfen,
      dfen: this.#dfen,
      positionVersion: this.#positionVersion,
      phase: this.#phase,
      resumePhase: this.#resumePhase,
      streamerColor: this.#streamerColor,
      rolledDfen: this.#rolledDfen,
      roundId: this.#roundId,
      moves: this.#moves,
      candidates: set
        ? {
            request: set.request,
            status: set.status,
            reason: set.reason,
            choices: set.choices,
          }
        : null,
      animation: this.#animation ?? null,
      resolvedRounds: [...this.#resolvedRounds],
      winner: this.#winner,
      history: this.#history,
      pendingPass: this.#pendingPass,
      chatUnavailable: this.#chatUnavailable,
    });
  }

  /** Only a validated local checkpoint may call this. No HTTP state-import route exists. */
  restore(saved: SavedGame, requiresChat: boolean) {
    this.#cancelWork();
    const state = structuredClone(saved);
    this.#gameId = state.gameId;
    this.#startingDfen = state.startingDfen;
    this.#dfen = state.dfen;
    this.#positionVersion = state.positionVersion;
    this.#streamerColor = state.streamerColor;
    this.#rolledDfen = state.rolledDfen;
    this.#roundId = state.roundId;
    this.#moves = [...state.moves];
    this.#candidates = state.candidates ?? undefined;
    if (this.#candidates)
      this.#candidates = {
        ...this.#candidates,
        request: {
          ...this.#candidates.request,
          sessionId: this.#options.sessionId,
        },
      };
    this.#animation = state.animation ?? undefined;
    this.#resolvedRounds = new Set(state.resolvedRounds);
    this.#history = [...state.history];
    this.#lastTurn = this.#history.at(-1) ?? null;
    this.#winner = state.winner;
    // A persisted derived pass flag must be rechecked against the original legal tree.
    this.#pendingPass = false;
    this.#node = {};
    this.#failed = undefined;
    const effective =
      state.phase === 'paused' ? state.resumePhase : state.phase;
    this.#chatUnavailable =
      state.chatUnavailable || requiresChat || effective === 'voting';
    if (effective === 'idle' || effective === 'game-over') {
      this.#phase = effective;
      this.#resumePhase = null;
      this.#chatUnavailable = false;
    } else {
      this.#phase = 'paused';
      this.#resumePhase = effective;
      if (this.#animation) {
        this.#resumePhase = 'chat-animation';
        this.#failed = 'animation';
      } else if (effective === 'voting' || effective === 'preview') {
        this.#renewRound();
        this.#resumePhase = 'preview';
        this.#failed = 'choices';
      } else if (
        effective === 'streamer-turn' ||
        effective === 'streamer-preparing'
      )
        this.#failed = 'tree';
      else if (effective === 'chat-preparing')
        this.#failed = this.#candidates ? 'choices' : 'candidates';
      else if (effective === 'chat-animation' || effective === 'resolving')
        this.#failed = 'animation';
    }
    this.#announcement =
      this.#phase === 'paused'
        ? 'Saved game restored and paused. Reconnect chat if required, then resume explicitly.'
        : effective === 'game-over'
          ? `${this.#winner === this.#streamerColor ? 'Streamer' : 'Chat'} wins by king capture.`
          : 'Saved local session restored.';
  }

  storageBlocked(blocked: boolean) {
    this.#storageBlocked = blocked;
    if (blocked) this.pause();
  }

  chatInterrupted() {
    if (this.#disposed || ['idle', 'game-over'].includes(this.#phase)) return;
    this.pause();
    this.#chatUnavailable = true;
    if (this.#resumePhase === 'preview' || this.#resumePhase === 'voting') {
      this.#renewRound();
      this.#resumePhase = 'preview';
    }
    this.#announcement =
      'Twitch connection interrupted. The saved roll and choices are paused.';
    this.#changed();
  }

  chatRestored() {
    if (!this.#chatUnavailable || this.#disposed) return;
    this.#chatUnavailable = false;
    this.#announcement =
      'Chat is connected again. Resume the saved game explicitly.';
    this.#changed();
  }

  #renewRound() {
    if (
      !this.#roundId ||
      !this.#candidates ||
      this.#resolvedRounds.has(this.#roundId)
    )
      return;
    this.#roundId = randomUUID();
    this.#candidates = Object.freeze({
      ...this.#candidates,
      request: Object.freeze({
        ...this.#candidates.request,
        roundId: this.#roundId,
      }),
    });
  }

  #changed() {
    if (!this.#disposed) this.#options.changed();
  }
  #setPhase(phase: GamePhase) {
    if (this.#phase === 'paused') this.#resumePhase = phase;
    else this.#phase = phase;
  }
  #apply(dfen: string, uci: string) {
    return Rules.applyMove(dfen, uci.slice(0, 2), uci.slice(2, 4), uci[4]);
  }
  #terminal(dfen: string) {
    const board = dfen.split(' ')[0]!;
    return !board.includes('K') || !board.includes('k');
  }
  #clearTimer() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
  }
  #cancelWork() {
    this.#job?.abort();
    this.#job = undefined;
    this.#clearTimer();
  }

  #freezeRoll() {
    const faces = this.#options.roll?.() ?? [
      randomInt(1, 7),
      randomInt(1, 7),
      randomInt(1, 7),
    ];
    if (
      faces.length !== 3 ||
      faces.some((face) => !Number.isInteger(face) || face < 1 || face > 6)
    )
      throw new Error('Invalid dice source');
    const letters = [...faces]
      .sort((a, b) => a - b)
      .map((face) => Rules.getPieceFromDice(face)!.toUpperCase())
      .join('');
    const dice =
      this.#dfen.split(' ')[1] === 'w' ? letters : letters.toLowerCase();
    this.#dfen = `${this.#dfen.split(' ').slice(0, 6).join(' ')} ${dice}`;
    this.#rolledDfen = this.#dfen;
    this.#positionVersion++;
    this.#moves = [];
  }

  #beginTurn() {
    this.#rolledDfen = null;
    this.#node = {};
    this.#moves = [];
    this.#candidates = undefined;
    this.#roundId = null;
    if (this.#dfen.split(' ')[1] === this.#streamerColor) {
      this.#setPhase('streamer-roll');
      this.#announcement =
        'Your turn. Roll once, then choose any complete legal turn.';
      this.#changed();
    } else {
      this.#setPhase('chat-roll');
      this.#freezeRoll();
      this.#roundId = randomUUID();
      this.#setPhase('chat-preparing');
      this.#announcement = 'Preparing chat choices from one frozen roll…';
      this.#changed();
      this.#prepareChat();
    }
  }

  #prepareStreamer() {
    const root = this.#rolledDfen;
    if (!root) return;
    const job = new AbortController();
    this.#job = job;
    void (this.#options.tree ?? legalTurnTree)(root, job.signal)
      .then((tree) => {
        if (
          this.#job !== job ||
          job.signal.aborted ||
          this.#rolledDfen !== root ||
          this.#disposed
        )
          return;
        this.#job = undefined;
        if (!tree) {
          this.#fail('tree');
          return;
        }
        let node = tree;
        let replay = root;
        for (const move of this.#moves) {
          if (!Object.hasOwn(node, move)) {
            this.#fail('tree');
            return;
          }
          const next = this.#apply(replay, move);
          if (!next) {
            this.#fail('tree');
            return;
          }
          replay = next;
          node = node[move]!;
        }
        if (replay !== this.#dfen) {
          this.#fail('tree');
          return;
        }
        this.#node = node;
        if (!Object.keys(node).length) {
          if (this.#moves.length) {
            this.#fail('tree');
            return;
          }
          this.#pass();
          return;
        }
        this.#setPhase('streamer-turn');
        this.#announcement = 'Choose a piece and a legal destination.';
        this.#changed();
      })
      .catch(() => {
        if (this.#job === job && !this.#disposed) {
          this.#job = undefined;
          this.#fail('tree');
        }
      });
  }

  #prepareChat() {
    if (!this.#rolledDfen || !this.#roundId) return;
    const request: CandidateRequest = {
      sessionId: this.#options.sessionId,
      positionVersion: this.#positionVersion,
      roundId: this.#roundId,
      rolledDfen: this.#rolledDfen,
      seed: randomInt(0, 0x7fffffff),
    };
    const job = new AbortController();
    this.#job = job;
    void (this.#options.candidates ?? generateCandidates)(request, {
      signal: job.signal,
    })
      .then((result) => {
        if (this.#job !== job || job.signal.aborted || this.#disposed) return;
        this.#job = undefined;
        if (
          result.request.sessionId !== request.sessionId ||
          result.request.roundId !== request.roundId ||
          result.request.positionVersion !== request.positionVersion ||
          result.request.rolledDfen !== request.rolledDfen
        ) {
          this.#fail('candidates');
          return;
        }
        if (
          result.status === 'unavailable' ||
          (result.status === 'ready' && !result.choices.length)
        ) {
          this.#fail('candidates');
          return;
        }
        this.#candidates = result;
        if (this.#chatUnavailable) this.#renewRound();
        if (result.status === 'forced-pass') {
          this.#pass();
          return;
        }
        this.#setPhase('preview');
        this.#announcement =
          result.choices.length === 1
            ? 'One retained engine choice. It will play automatically.'
            : 'Choices frozen. Review the options before voting opens.';
        this.#changed();
        this.#scheduleSingle();
      })
      .catch(() => {
        if (this.#job === job && !this.#disposed) {
          this.#job = undefined;
          this.#fail('candidates');
        }
      });
  }

  #validateRetained(animation: boolean) {
    const root = this.#rolledDfen;
    const set = this.#candidates;
    const kind = animation ? 'animation' : 'choices';
    const forcedPass =
      !animation && set?.status === 'forced-pass' && !set.choices.length;
    if (
      !root ||
      !set ||
      (!forcedPass && (set.status !== 'ready' || !set.choices.length))
    ) {
      this.#fail(kind);
      return;
    }
    const job = new AbortController();
    this.#job = job;
    void (this.#options.tree ?? legalTurnTree)(root, job.signal)
      .then((tree) => {
        if (this.#job !== job || job.signal.aborted || this.#disposed) return;
        this.#job = undefined;
        if (!tree) {
          this.#fail(kind);
          return;
        }
        if (forcedPass) {
          if (Object.keys(tree).length) this.#fail(kind);
          else this.#pass();
          return;
        }
        for (const choice of set.choices) {
          let node = tree;
          let replay = root;
          for (const move of choice.moves) {
            if (!Object.hasOwn(node, move)) {
              this.#fail(kind);
              return;
            }
            const next = this.#apply(replay, move);
            if (!next) {
              this.#fail(kind);
              return;
            }
            replay = next;
            node = node[move]!;
          }
          if (!this.#terminal(replay)) replay = Rules.endTurn(replay) ?? '';
          if (Object.keys(node).length || replay !== choice.resultingDfen) {
            this.#fail(kind);
            return;
          }
        }
        if (animation) {
          const pending = this.#animation;
          if (
            !pending ||
            !this.#roundId ||
            !this.#resolvedRounds.has(this.#roundId) ||
            !set.choices.some(
              (choice) =>
                choice.option === pending.choice.option &&
                choice.resultingDfen === pending.choice.resultingDfen &&
                choice.moves.join(',') === pending.choice.moves.join(','),
            ) ||
            pending.nextIndex !== this.#moves.length ||
            pending.nextIndex >= pending.choice.moves.length ||
            pending.choice.moves.slice(0, pending.nextIndex).join(',') !==
              this.#moves.join(',')
          ) {
            this.#fail(kind);
            return;
          }
          let replay = root;
          for (const move of this.#moves)
            replay = this.#apply(replay, move) ?? '';
          if (replay !== this.#dfen) {
            this.#fail(kind);
            return;
          }
          this.#setPhase('chat-animation');
          this.#announcement =
            'Saved chat turn validated. Continuing from its next unplayed move.';
          this.#changed();
          this.#scheduleAnimation();
        } else {
          if (this.#dfen !== root || this.#moves.length) {
            this.#fail(kind);
            return;
          }
          if (this.#chatUnavailable) this.#renewRound();
          this.#setPhase('preview');
          this.#announcement =
            'Saved choices validated. Replaying preview before a fresh vote.';
          this.#changed();
          this.#scheduleSingle();
        }
      })
      .catch(() => {
        if (this.#job === job && !this.#disposed) {
          this.#job = undefined;
          this.#fail(kind);
        }
      });
  }

  #fail(kind: 'tree' | 'candidates' | 'choices' | 'animation') {
    this.#failed = kind;
    if (this.#phase !== 'paused') {
      this.#resumePhase = this.#phase;
      this.#phase = 'paused';
    }
    this.#announcement =
      'Engine preparation failed. Resume retries the same frozen roll.';
    this.#changed();
  }

  #pass() {
    this.#announcement = 'No legal move for this roll — forced pass.';
    if (this.#phase === 'paused') {
      this.#pendingPass = true;
      this.#changed();
      return;
    }
    this.#finishTurn('forced-pass');
  }

  #finishTurn(reason: TurnRecord['reason']) {
    const next = Rules.endTurn(this.#dfen);
    if (!next) throw new Error('Engine rejected the completed turn');
    this.#dfen = next;
    this.#positionVersion++;
    this.#record(reason);
    this.#beginTurn();
  }

  #record(reason: TurnRecord['reason']) {
    this.#lastTurn = {
      side: this.#rolledDfen!.split(' ')[1] as Color,
      rolledDfen: this.#rolledDfen!,
      moves: [...this.#moves],
      resultingDfen: this.#dfen,
      reason,
      roundId: this.#roundId,
      option: this.#animation?.choice.option ?? null,
    };
    this.#history.push(this.#lastTurn);
  }

  #finishGame(reason: TurnRecord['reason']) {
    const board = this.#dfen.split(' ')[0]!;
    this.#winner = board.includes('K') ? 'w' : 'b';
    this.#record(reason);
    this.#phase = 'game-over';
    this.#resumePhase = null;
    this.#announcement = `${this.#winner === this.#streamerColor ? 'Streamer' : 'Chat'} wins by king capture.`;
    this.#animation = undefined;
    this.#cancelWork();
    this.#changed();
  }

  #scheduleSingle() {
    if (
      this.#options.externalPreview ||
      this.#phase !== 'preview' ||
      this.#candidates?.choices.length !== 1 ||
      this.#timer
    )
      return;
    const roundId = this.#roundId!;
    const option = this.#candidates.choices[0]!.option;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.resolveChoice(roundId, option);
    }, this.#options.autoplayDelayMs ?? 1500);
  }

  #scheduleAnimation() {
    if (this.#phase !== 'chat-animation' || !this.#animation || this.#timer)
      return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      const animation = this.#animation;
      if (this.#phase !== 'chat-animation' || !animation) return;
      const uci = animation.choice.moves[animation.nextIndex]!;
      const next = this.#apply(this.#dfen, uci);
      if (!next) {
        this.#fail('animation');
        return;
      }
      this.#dfen = next;
      this.#positionVersion++;
      this.#moves.push(uci);
      animation.nextIndex++;
      if (this.#terminal(next)) {
        this.#finishGame(animation.reason);
        return;
      }
      if (animation.nextIndex === animation.choice.moves.length) {
        this.#dfen = animation.choice.resultingDfen;
        this.#positionVersion++;
        this.#record(animation.reason);
        this.#animation = undefined;
        this.#beginTurn();
      } else {
        this.#changed();
        this.#scheduleAnimation();
      }
    }, this.#options.animationStepMs ?? 350);
  }
}
