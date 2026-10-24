import { useCallback, useEffect, useRef, useState } from "react";
import { Dominoes, type DominoesMove, type HandResult } from "@isputnik/games-engine";
import {
  COMPUTER,
  clearDominoesGame,
  loadDominoesGame,
  saveDominoesGame,
  saveDominoesSetup,
  startDominoesGame,
  type DominoesSetup,
  type LoadedDominoesGame
} from "./storage";

// One local game of Dominoes against the computer: the position, the setup,
// the seed and the moves so far. Every change goes through the engine and is
// saved at once; the computer moves from an effect, with a pause per move (a
// shorter one per tile drawn) so a person can follow it. A hand that ends
// waits on the person: its summary is up until they acknowledge it, and the
// computer does not lead the next hand before that.
/** Mutable so a test can take the waiting out. */
export const COMPUTER_DELAYS = { play: 750, draw: 420, pass: 650 };

export interface DominoesGameController {
  game: LoadedDominoesGame | null;
  thinking: boolean;
  start(setup: DominoesSetup): void;
  play(move: DominoesMove): void;
  abandon(): void;
  /** Whether it is the person's move. */
  humanToMove: boolean;
  /** A hand that ended and has not been acknowledged yet (never the last one of a game). */
  pendingHand: HandResult | null;
  acknowledgeHand(): void;
}

export function useDominoesGame(): DominoesGameController {
  const [game, setGame] = useState<LoadedDominoesGame | null>(() => loadDominoesGame());
  // Hands summarised already: the ones before the page opened count as seen.
  const [seenHands, setSeenHands] = useState(() => game?.state.history.length ?? 0);
  const [thinking, setThinking] = useState(false);
  const timer = useRef<number | null>(null);

  const start = useCallback((setup: DominoesSetup) => {
    saveDominoesSetup(setup);
    const next = startDominoesGame(setup);
    saveDominoesGame(next);
    setGame(next);
    setSeenHands(0);
  }, []);

  const play = useCallback((move: DominoesMove) => {
    setGame((current) => {
      if (!current || current.state.status.kind !== "playing") return current;
      let state;
      try {
        state = Dominoes.applyMove(current.state, move);
      } catch {
        return current;
      }
      const next = { ...current, moves: [...current.moves, move], state };
      saveDominoesGame(next);
      return next;
    });
  }, []);

  const abandon = useCallback(() => {
    clearDominoesGame();
    setGame(null);
  }, []);

  const status = game?.state.status;
  const history = game?.state.history ?? [];
  const pendingHand = status?.kind === "playing" && history.length > seenHands ? history[history.length - 1] : null;
  const paused = pendingHand !== null;
  const acknowledgeHand = useCallback(() => setSeenHands(history.length), [history.length]);
  const computerTurn = Boolean(game && status?.kind === "playing" && status.turn === COMPUTER);

  useEffect(() => {
    if (!computerTurn || !game || paused) {
      setThinking(false);
      return;
    }
    setThinking(true);
    const state = game.state;
    const move = Dominoes.chooseDominoesMove(state, game.setup.level, Math.random);
    const delay = move?.kind === "draw" ? COMPUTER_DELAYS.draw : move?.kind === "pass" ? COMPUTER_DELAYS.pass : COMPUTER_DELAYS.play;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setThinking(false);
      if (move) play(move);
    }, delay);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [computerTurn, game, paused, play]);

  return {
    game,
    thinking,
    start,
    play,
    abandon,
    humanToMove: Boolean(game && status?.kind === "playing" && !computerTurn && !paused),
    pendingHand,
    acknowledgeHand
  };
}
