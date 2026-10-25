import { randomInt, randomUUID } from 'node:crypto';
import { DiceChess as Rules } from '@fortemate/dicechess-engine/rules';
import type { MoveTree } from '@fortemate/dicechess-engine';
import { generateCandidates } from '../engine/generator.ts';
import { legalTurnTree } from '../engine/legal-turns.ts';
import type {
  CandidateChoice,
  CandidateRequest,
  CandidateResult,
} from '../engine/types.ts';
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
}

interface Animation {
  choice: CandidateChoice;
  reason: TurnRecord['reason'];
  nextIndex: number;
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
  #candidates: CandidateResult | undefined;
  #job: AbortController | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #animation: Animation | undefined;
  #resolvedRounds = new Set<string>();
  #announcement = 'Start a local game. Twitch voting is not connected yet.';
  #winner: Color | null = null;
  #lastTurn: TurnRecord | null = null;
  #pendingPass = false;
  #failed: 'tree' | 'candidates' | undefined;
  #disposed = false;
  #chatUnavailable = false;

  constructor(options: GameOptions) {
    this.#options = options;
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

  controls(): Omit<OperatorGameState, 'sessionId' | 'revision'> {
    return {
      legalActions:
        this.#phase === 'streamer-turn' ? Object.keys(this.#node) : [],
      canStart: this.#phase === 'idle',
      canRoll: this.#phase === 'streamer-roll',
      canPause: !['idle', 'paused', 'game-over'].includes(this.#phase),
      canResume: this.#phase === 'paused' && !this.#chatUnavailable,
      canRematch: this.#phase === 'game-over',
    };
  }

  start(streamerColor: Color): boolean {
    if (!this.controls().canStart && !this.controls().canRematch) return false;
    this.#cancelWork();
    this.#gameId = randomUUID();
    this.#streamerColor = streamerColor;
    this.#dfen = this.#options.initialDfen ?? initialPosition;
    this.#positionVersion++;
    this.#winner = null;
    this.#lastTurn = null;
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
    if (this.#phase !== 'streamer-turn' || !Object.hasOwn(this.#node, uci))
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
      this.#finishTurn('forced-pass');
      return true;
    }
    const failed = this.#failed;
    this.#failed = undefined;
    this.#changed();
    if (failed === 'tree') this.#prepareStreamer();
    else if (failed === 'candidates') this.#prepareChat();
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
    this.#phase = 'resolving';
    this.#announcement = automatic
      ? 'One retained engine choice — playing automatically.'
      : `Chat chose option ${option}.`;
    this.#changed();
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
      this.#changed();
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
        this.#node = tree;
        if (!Object.keys(tree).length) {
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
            : 'Choices frozen. Twitch voting integration is pending.';
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

  #fail(kind: 'tree' | 'candidates') {
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
    this.#changed();
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
    };
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
        this.#fail('candidates');
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
        this.#changed();
        this.#beginTurn();
      } else {
        this.#changed();
        this.#scheduleAnimation();
      }
    }, this.#options.animationStepMs ?? 350);
  }
}
